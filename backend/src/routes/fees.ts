import { Router } from "express";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import {
  canAccessOrg,
  isParent,
  isSuperAdminOrOrgStaff,
  isSuperAdminOrOrgStaffAny
} from "../middleware/roleCheck";
import { FeeGroup } from "../models/FeeGroup";
import { FeePayment, type FeePaymentStatus } from "../models/FeePayment";
import { Student } from "../models/Student";
import { StudentTransport } from "../models/StudentTransport";
import { asyncHandler } from "../utils/asyncHandler";
import { invalidateOrgReportsCache } from "../utils/cache";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";
import { paginate, parsePaginationQuery } from "../utils/paginate";

type MonthAllocation = {
  status: FeePaymentStatus;
  amountPaid: number;
  paidAt?: Date;
};

const monthKeyNow = (): string => new Date().toISOString().slice(0, 7);

const sortMonths = (months: string[]): string[] =>
  [...new Set(months)].sort((a, b) => a.localeCompare(b));

const distributeAdvanceAcrossMonths = (
  sortedMonths: string[],
  monthlyFee: number,
  cashPaid: number
): Map<string, MonthAllocation> => {
  const totalDue = monthlyFee * sortedMonths.length;
  const out = new Map<string, MonthAllocation>();
  const nowKey = monthKeyNow();

  if (cashPaid >= totalDue) {
    const paidAt = new Date();
    for (const m of sortedMonths) {
      out.set(m, { status: "paid", amountPaid: monthlyFee, paidAt });
    }
    return out;
  }

  let remaining = cashPaid;
  for (const m of sortedMonths) {
    if (remaining >= monthlyFee) {
      out.set(m, { status: "paid", amountPaid: monthlyFee, paidAt: new Date() });
      remaining -= monthlyFee;
    } else if (remaining > 0) {
      out.set(m, { status: "partial", amountPaid: remaining, paidAt: new Date() });
      remaining = 0;
    } else {
      let status: FeePaymentStatus = "pending";
      if (m < nowKey) {
        status = "overdue";
      }
      out.set(m, { status, amountPaid: 0 });
    }
  }

  return out;
};

const feesRouter = Router();

const scopeMiddleware = [auth, orgScope, requireOrgScope, canAccessOrg] as const;

const allowFeeRead = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.role === "superAdmin") {
    next();
    return;
  }
  if (authReq.user?.role === "parent") {
    isParent(req, res, next);
    return;
  }
  isSuperAdminOrOrgStaffAny("canCollectFees", "canViewReports")(req, res, next);
};

const generateMonthlyFeePayments = async (
  organizationId: string,
  month: string,
  academicYear?: string
): Promise<{ createdCount: number; updatedCount: number; totalStudents: number }> => {
  const transportFilter: Record<string, unknown> = {
    organizationId: new Types.ObjectId(organizationId),
    status: "active"
  };
  if (academicYear) {
    transportFilter.academicYear = academicYear;
  }

  const transports = await StudentTransport.find(transportFilter);
  const nowMonthKey = new Date().toISOString().slice(0, 7);

  let createdCount = 0;
  let updatedCount = 0;

  for (const transport of transports) {
    const existing = await FeePayment.findOne({
      organizationId: transport.organizationId,
      studentId: transport.studentId,
      month,
      academicYear: transport.academicYear
    });

    if (!existing) {
      const status = month < nowMonthKey ? "overdue" : "pending";
      await FeePayment.create({
        organizationId: transport.organizationId,
        studentId: transport.studentId,
        busId: transport.busId,
        transportId: transport._id,
        month,
        academicYear: transport.academicYear,
        amount: transport.monthlyTransportFee,
        amountPaid: 0,
        status
      });
      createdCount += 1;
    } else if (month < nowMonthKey && existing.status === "pending") {
      existing.status = "overdue";
      await existing.save();
      updatedCount += 1;
    }
  }

  return { createdCount, updatedCount, totalStudents: transports.length };
};

feesRouter.get(
  "/",
  ...scopeMiddleware,
  allowFeeRead,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { month, busId, academicYear, status } = req.query as {
      month?: string;
      busId?: string;
      academicYear?: string;
      status?: string;
    };
    if (!month) {
      res.status(400).json({ success: false, data: null, message: "month is required" });
      return;
    }

    const orgId = getScopedOrganizationId(authReq, res)!;
    const transportFilter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(orgId),
      status: "active"
    };
    if (busId && Types.ObjectId.isValid(busId)) {
      transportFilter.busId = new Types.ObjectId(busId);
    }
    if (academicYear) {
      transportFilter.academicYear = academicYear;
    }

    const activeTransports = await StudentTransport.find(transportFilter).select("studentId");
    const transportStudentIds = activeTransports.map((t) => t.studentId);

    const filter: Record<string, unknown> = {
      ...orgFilter(authReq, res),
      month,
      studentId: { $in: transportStudentIds }
    };
    if (busId && Types.ObjectId.isValid(busId)) {
      filter.busId = busId;
    }
    if (status === "pending") {
      filter.status = { $in: ["pending", "overdue"] };
    } else if (status) {
      filter.status = status;
    }
    if (authReq.user?.role === "parent") {
      const parentIds = authReq.user.parentStudentIds ?? [];
      filter.studentId = {
        $in: transportStudentIds.filter((id) => parentIds.includes(String(id)))
      };
    }

    const existingCount = await FeePayment.countDocuments(filter);

    if (existingCount === 0 && authReq.user?.role !== "parent" && transportStudentIds.length > 0) {
      await generateMonthlyFeePayments(orgId, month, academicYear);
      await invalidateOrgReportsCache(orgId);
    }

    const { page, limit } = parsePaginationQuery(req.query, 50);
    const { data, pagination } = await paginate(FeePayment, filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: [
        { path: "studentId", select: "name grade" },
        { path: "busId", select: "busNumber" },
        { path: "transportId", select: "monthlyTransportFee pickupStop" }
      ]
    });

    res.json({
      success: true,
      data,
      pagination,
      message: "Fee payments fetched successfully"
    });
  })
);

feesRouter.post(
  "/record",
  ...scopeMiddleware,
  isSuperAdminOrOrgStaff("canCollectFees"),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { studentId, month, academicYear, amountPaid } = req.body as {
      studentId?: string;
      month?: string;
      academicYear?: string;
      amountPaid?: number;
    };

    if (!studentId || !month || !academicYear || amountPaid === undefined) {
      res.status(400).json({
        success: false,
        data: null,
        message: "studentId, month, academicYear and amountPaid are required"
      });
      return;
    }

    const student = await Student.findOne({ _id: studentId, ...orgFilter(authReq, res) });
    if (!student) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    const transport = await StudentTransport.findOne({
      ...orgFilter(authReq, res),
      studentId: student._id,
      status: "active",
      academicYear
    });
    if (!transport) {
      res.status(400).json({
        success: false,
        data: null,
        message: "This student is not registered for bus transport"
      });
      return;
    }

    const monthlyFee = transport.monthlyTransportFee;
    const status =
      amountPaid >= monthlyFee ? "paid" : amountPaid > 0 ? "partial" : "pending";

    const payment = await FeePayment.findOneAndUpdate(
      { studentId, month, academicYear },
      {
        organizationId: student.organizationId,
        studentId,
        busId: transport.busId,
        transportId: transport._id,
        month,
        academicYear,
        amount: monthlyFee,
        amountPaid,
        status,
        paidAt: status === "pending" ? undefined : new Date(),
        collectedBy: authReq.user?.userId,
        paymentType: "single"
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
      .populate("studentId", "name grade")
      .populate("busId", "busNumber")
      .populate("collectedBy", "name role");

    await invalidateOrgReportsCache(String(student.organizationId));
    res.json({ success: true, data: payment, message: "Fee payment recorded successfully" });
  })
);

feesRouter.post(
  "/record-advance",
  ...scopeMiddleware,
  isSuperAdminOrOrgStaff("canCollectFees"),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { studentId, months, amountPaid, academicYear, notes } = req.body as {
      studentId?: string;
      months?: string[];
      amountPaid?: number;
      academicYear?: string;
      notes?: string;
    };

    if (
      !studentId ||
      !Array.isArray(months) ||
      months.length === 0 ||
      academicYear === undefined ||
      amountPaid === undefined
    ) {
      res.status(400).json({
        success: false,
        data: null,
        message: "studentId, months[], academicYear and amountPaid are required"
      });
      return;
    }

    const sortedMonths = sortMonths(months);
    if (sortedMonths.length < 2 || sortedMonths.length > 12) {
      res.status(400).json({
        success: false,
        data: null,
        message: "months must contain between 2 and 12 unique YYYY-MM values"
      });
      return;
    }

    const student = await Student.findOne({ _id: studentId, ...orgFilter(authReq, res) });
    if (!student) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    if (student.academicYear !== academicYear) {
      res.status(400).json({
        success: false,
        data: null,
        message: "academicYear does not match the student's academic year"
      });
      return;
    }

    const transport = await StudentTransport.findOne({
      ...orgFilter(authReq, res),
      studentId: student._id,
      status: "active",
      academicYear
    });
    if (!transport) {
      res.status(400).json({
        success: false,
        data: null,
        message: "This student is not registered for bus transport"
      });
      return;
    }

    const monthlyFee = transport.monthlyTransportFee;
    const totalDue = monthlyFee * sortedMonths.length;

    const alreadyPaid = await FeePayment.findOne({
      ...orgFilter(authReq, res),
      studentId: student._id,
      academicYear,
      month: { $in: sortedMonths },
      status: "paid"
    });
    if (alreadyPaid) {
      res.status(400).json({
        success: false,
        data: null,
        message: `One or more selected months are already fully paid (e.g. ${alreadyPaid.month})`
      });
      return;
    }

    const allocation = distributeAdvanceAcrossMonths(sortedMonths, monthlyFee, amountPaid);

    const feeGroupDoc = await FeeGroup.create({
      organizationId: student.organizationId,
      studentId: student._id,
      busId: transport.busId,
      transportId: transport._id,
      months: sortedMonths,
      totalAmount: amountPaid,
      totalDue,
      academicYear,
      collectedBy: authReq.user?.userId ? new Types.ObjectId(authReq.user.userId) : undefined,
      collectedAt: new Date(),
      notes
    });
    feeGroupDoc.receiptNumber = `GRP-${String(feeGroupDoc._id).slice(-6).toUpperCase()}`;
    await feeGroupDoc.save();

    const paymentsOut: unknown[] = [];

    for (const month of sortedMonths) {
      const alloc = allocation.get(month);
      if (!alloc) {
        continue;
      }

      const existing = await FeePayment.findOne({
        studentId: student._id,
        month,
        academicYear
      });

      if (existing?.status === "paid") {
        continue;
      }

      const paidAt = alloc.paidAt;

      const updated = await FeePayment.findOneAndUpdate(
        { studentId: student._id, month, academicYear },
        {
          organizationId: student.organizationId,
          studentId: student._id,
          busId: transport.busId,
          transportId: transport._id,
          month,
          academicYear,
          amount: monthlyFee,
          amountPaid: alloc.amountPaid,
          status: alloc.status,
          paidAt,
          collectedBy: authReq.user?.userId ? new Types.ObjectId(authReq.user.userId) : undefined,
          notes: notes ?? existing?.notes,
          feeGroupId: feeGroupDoc._id,
          paymentType: "advance"
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
        .populate("studentId", "name grade")
        .populate("busId", "busNumber")
        .populate("collectedBy", "name role");

      if (updated) {
        paymentsOut.push(updated);
      }
    }

    const feeGroup = await FeeGroup.findById(feeGroupDoc._id).populate("collectedBy", "name");

    await invalidateOrgReportsCache(String(student.organizationId));
    res.status(201).json({
      success: true,
      data: { feeGroup, payments: paymentsOut },
      message: "Advance fee payment recorded successfully"
    });
  })
);

feesRouter.get(
  "/student/:studentId",
  ...scopeMiddleware,
  allowFeeRead,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const studentId = String(req.params.studentId);

    if (!Types.ObjectId.isValid(studentId)) {
      res.status(400).json({ success: false, data: null, message: "Invalid student id" });
      return;
    }

    if (
      authReq.user?.role === "parent" &&
      !authReq.user.parentStudentIds?.includes(studentId)
    ) {
      res.status(403).json({
        success: false,
        data: null,
        message: "Forbidden: cannot access this student's fees"
      });
      return;
    }

    const student = await Student.findOne({ _id: studentId, ...orgFilter(authReq, res) });
    if (!student) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    const payments = await FeePayment.find({
      ...orgFilter(authReq, res),
      studentId: new Types.ObjectId(studentId)
    })
      .populate("feeGroupId")
      .populate("busId", "busNumber")
      .populate("collectedBy", "name")
      .sort({ month: -1 });

    res.json({
      success: true,
      data: payments,
      message: "Student fee history fetched successfully"
    });
  })
);

feesRouter.get(
  "/generate-monthly",
  ...scopeMiddleware,
  isSuperAdminOrOrgStaff("canCollectFees"),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { month, academicYear } = req.query as { month?: string; academicYear?: string };
    if (!month || !academicYear) {
      res.status(400).json({
        success: false,
        data: null,
        message: "month and academicYear are required"
      });
      return;
    }

    const orgId = getScopedOrganizationId(authReq, res)!;
    const { createdCount, updatedCount, totalStudents } = await generateMonthlyFeePayments(
      orgId,
      month,
      academicYear
    );

    if (createdCount > 0 || updatedCount > 0) {
      await invalidateOrgReportsCache(orgId);
    }

    res.json({
      success: true,
      data: { createdCount, updatedCount, totalStudents },
      message: "Monthly fee generation completed"
    });
  })
);

const buildReceiptData = async (paymentId: string, orgScopeFilter: Record<string, unknown>) => {
  const payment = await FeePayment.findOne({ _id: paymentId, ...orgScopeFilter })
    .populate("studentId", "name grade")
    .populate("busId", "busNumber")
    .populate("transportId", "monthlyTransportFee")
    .populate("collectedBy", "name");

  if (!payment) {
    return null;
  }

  const student = payment.studentId as unknown as {
    name: string;
    grade?: string;
  };
  const bus = payment.busId as unknown as { busNumber: string };
  const transport = payment.transportId as unknown as { monthlyTransportFee?: number } | null;
  const collector = payment.collectedBy as unknown as { name: string } | null;

  const base: Record<string, unknown> = {
    studentName: student?.name,
    grade: student?.grade,
    busNumber: bus?.busNumber,
    month: payment.month,
    monthlyFee: transport?.monthlyTransportFee ?? payment.amount,
    amountPaid: payment.amountPaid,
    status: payment.status,
    paidAt: payment.paidAt,
    collectedBy: collector?.name ?? null,
    receiptNumber: String(payment._id).slice(-6).toUpperCase(),
    paymentType: payment.paymentType ?? "single",
    isPartOfGroup: false
  };

  if (!payment.feeGroupId) {
    return base;
  }

  const group = await FeeGroup.findById(payment.feeGroupId);
  const groupPayments = await FeePayment.find({ feeGroupId: payment.feeGroupId }).sort({
    month: 1
  });

  return {
    ...base,
    isPartOfGroup: true,
    groupReceiptNumber: group?.receiptNumber ?? null,
    groupedMonths: groupPayments.map((p) => ({
      month: p.month,
      status: p.status,
      amountPaid: p.amountPaid,
      amountDue: p.amount
    }))
  };
};

feesRouter.get(
  "/receipt/:paymentId",
  ...scopeMiddleware,
  isSuperAdminOrOrgStaff("canCollectFees"),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const data = await buildReceiptData(String(req.params.paymentId), orgFilter(authReq, res));
    if (!data) {
      res.status(404).json({ success: false, data: null, message: "Payment not found" });
      return;
    }
    res.json({
      success: true,
      data,
      message: "Receipt generated successfully"
    });
  })
);

feesRouter.post(
  "/receipt/:paymentId",
  ...scopeMiddleware,
  isSuperAdminOrOrgStaff("canCollectFees"),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const data = await buildReceiptData(String(req.params.paymentId), orgFilter(authReq, res));
    if (!data) {
      res.status(404).json({ success: false, data: null, message: "Payment not found" });
      return;
    }
    res.json({
      success: true,
      data,
      message: "Receipt generated successfully"
    });
  })
);

export default feesRouter;
