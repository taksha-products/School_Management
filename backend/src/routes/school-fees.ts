import { Router } from "express";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { requireFeature } from "../middleware/featureFlag";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import { canAccessOrg, isSuperAdminOrOrgStaff } from "../middleware/roleCheck";
import { FeeLedger } from "../models/FeeLedger";
import { SchoolFeePayment } from "../models/SchoolFeePayment";
import { Student } from "../models/Student";
import {
  buildOrgFeeSummary,
  buildReceiptView,
  buildStudentFeeLedgerView,
  buildStudentFeeStatusMap,
  buildStudentFeeStatusMapForStudents
} from "../services/schoolFeeService";
import {
  applySchoolPaymentLinesToLedger,
  buildSchoolPaymentLines,
  createSchoolPaymentIntent,
  parseSchoolPaymentLines,
  type SchoolPaymentLineBody
} from "../services/schoolFeeCollection";
import {
  executeAssignFeeStructure,
  previewAssignFeeStructure,
  type AssignFeeStructureRequest
} from "../services/schoolFeeAssignmentService";
import { asyncHandler } from "../utils/asyncHandler";
import { validate } from "../middleware/validate";
import {
  getCached,
  invalidateOrgSchoolFeesCache,
  orgCacheKey,
  setCached
} from "../utils/cache";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";
import { paginate, paginateArray, parsePaginationQuery } from "../utils/paginate";
import { collectSchoolFeesValidation } from "../validators/schoolFees";
import {
  generateReceiptNumber,
  refreshOverdueStatuses
} from "../utils/schoolFeeLedger";

const schoolFeesRouter = Router();

const scopeMiddleware = [
  auth,
  orgScope,
  requireOrgScope,
  canAccessOrg,
  requireFeature("schoolFees")
] as const;

const allowCollect = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.role === "superAdmin") {
    next();
    return;
  }
  isSuperAdminOrOrgStaff("canCollectFees")(req, res, next);
};

const allowManageStudents = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.role === "superAdmin" || authReq.user?.role === "orgAdmin") {
    next();
    return;
  }
  isSuperAdminOrOrgStaff("canManageStudents")(req, res, next);
};

schoolFeesRouter.post(
  "/assign/preview",
  ...scopeMiddleware,
  allowManageStudents,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const outcome = await previewAssignFeeStructure(
      orgId,
      req.body as AssignFeeStructureRequest
    );

    if (!outcome.ok) {
      res.status(outcome.status).json({
        success: false,
        data: null,
        message: outcome.message
      });
      return;
    }

    res.json({
      success: true,
      data: outcome.preview,
      message: "Fee assignment preview generated successfully"
    });
  })
);

schoolFeesRouter.post(
  "/assign",
  ...scopeMiddleware,
  allowManageStudents,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const outcome = await executeAssignFeeStructure(orgId, req.body as AssignFeeStructureRequest);

    if (!outcome.ok) {
      res.status(outcome.status).json({
        success: false,
        data: null,
        message: outcome.message
      });
      return;
    }

    await invalidateOrgSchoolFeesCache(orgId);

    res.json({
      success: true,
      data: outcome.result,
      message: `Fees assigned to ${outcome.result.assigned} student(s) successfully`
    });
  })
);

schoolFeesRouter.post(
  "/payment-intent",
  ...scopeMiddleware,
  allowCollect,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { studentId, academicYear, payments, notes } = req.body as {
      studentId?: string;
      academicYear?: string;
      payments?: SchoolPaymentLineBody[];
      notes?: string;
    };

    if (!studentId || !academicYear || !Array.isArray(payments) || payments.length === 0) {
      res.status(400).json({
        success: false,
        data: null,
        message: "studentId, academicYear, and payments[] are required"
      });
      return;
    }

    const student = await Student.findOne({ _id: studentId, ...orgFilter(authReq, res) });
    if (!student) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    try {
      const intent = await createSchoolPaymentIntent({
        organizationId: orgId,
        studentId,
        academicYear,
        payments,
        createdBy: authReq.user!.userId,
        notes
      });

      res.status(201).json({
        success: true,
        data: intent,
        message: "Payment intent created"
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        data: null,
        message: error instanceof Error ? error.message : "Invalid payment request"
      });
    }
  })
);

schoolFeesRouter.get(
  "/ledger",
  ...scopeMiddleware,
  allowCollect,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { studentId, academicYear } = req.query as {
      studentId?: string;
      academicYear?: string;
    };

    if (!studentId || !academicYear) {
      res.status(400).json({
        success: false,
        data: null,
        message: "studentId and academicYear are required"
      });
      return;
    }

    const data = await buildStudentFeeLedgerView(orgId, studentId, academicYear);
    if (!data) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    res.json({
      success: true,
      data,
      message: "Fee ledger fetched successfully"
    });
  })
);

schoolFeesRouter.get(
  "/student-fee-status",
  ...scopeMiddleware,
  allowCollect,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { academicYear, studentIds: studentIdsRaw } = req.query as {
      academicYear?: string;
      studentIds?: string;
    };

    if (!academicYear) {
      res.status(400).json({
        success: false,
        data: null,
        message: "academicYear is required"
      });
      return;
    }

    const studentIds = studentIdsRaw
      ? studentIdsRaw
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      : [];

    const statusMap =
      studentIds.length > 0
        ? await buildStudentFeeStatusMapForStudents(orgId, academicYear, studentIds)
        : await buildStudentFeeStatusMap(orgId, academicYear);

    res.json({
      success: true,
      data: statusMap,
      message: "Student fee status fetched successfully"
    });
  })
);

schoolFeesRouter.get(
  "/outstanding",
  ...scopeMiddleware,
  allowCollect,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { grade, feeHeadName, academicYear } = req.query as {
      grade?: string;
      feeHeadName?: string;
      academicYear?: string;
    };

    if (!academicYear) {
      res.status(400).json({
        success: false,
        data: null,
        message: "academicYear is required"
      });
      return;
    }

    await refreshOverdueStatuses({
      organizationId: new Types.ObjectId(orgId),
      academicYear
    });

    const ledgerFilter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(orgId),
      academicYear
    };
    if (feeHeadName) {
      ledgerFilter.feeHeadName = feeHeadName;
    }

    const entries = await FeeLedger.find(ledgerFilter).populate("studentId", "name grade");

    const byStudent = new Map<
      string,
      {
        studentId: string;
        studentName: string;
        grade: string;
        totalDue: number;
        totalPaid: number;
        balance: number;
        overdueAmount: number;
      }
    >();

    for (const entry of entries) {
      const student = entry.studentId as unknown as {
        _id: Types.ObjectId;
        name: string;
        grade: string;
      } | null;
      if (!student) {
        continue;
      }
      if (grade && student.grade !== grade) {
        continue;
      }

      const key = student._id.toString();
      if (!byStudent.has(key)) {
        byStudent.set(key, {
          studentId: key,
          studentName: student.name,
          grade: student.grade,
          totalDue: 0,
          totalPaid: 0,
          balance: 0,
          overdueAmount: 0
        });
      }
      const row = byStudent.get(key)!;
      row.totalDue += entry.amountDue;
      row.totalPaid += entry.amountPaid;
      const bal = Math.max(0, entry.amountDue + entry.lateFee - entry.amountPaid);
      row.balance += bal;
      if (entry.status === "overdue") {
        row.overdueAmount += bal;
      }
    }

    const results = Array.from(byStudent.values())
      .filter((r) => r.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    const { page, limit } = parsePaginationQuery(req.query, 50);
    const { data, pagination } = paginateArray(results, page, limit);

    res.json({
      success: true,
      data,
      pagination,
      message: "Outstanding dues fetched successfully"
    });
  })
);

schoolFeesRouter.post(
  "/collect",
  ...scopeMiddleware,
  allowCollect,
  collectSchoolFeesValidation,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const {
      studentId,
      academicYear,
      paymentMode,
      upiTransactionId,
      payments,
      notes
    } = req.body as {
      studentId?: string;
      academicYear?: string;
      paymentMode?: "cash" | "upi" | "cheque" | "online";
      upiTransactionId?: string;
      payments?: SchoolPaymentLineBody[];
      notes?: string;
    };

    if (
      !studentId ||
      !academicYear ||
      !paymentMode ||
      !Array.isArray(payments) ||
      payments.length === 0
    ) {
      res.status(400).json({
        success: false,
        data: null,
        message: "studentId, academicYear, paymentMode, and payments[] are required"
      });
      return;
    }

    if ((paymentMode === "upi" || paymentMode === "online") && !upiTransactionId) {
      res.status(400).json({
        success: false,
        data: null,
        message: "upiTransactionId is required for upi/online payments"
      });
      return;
    }

    const student = await Student.findOne({ _id: studentId, ...orgFilter(authReq, res) });
    if (!student) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    let built;
    let normalizedPayments;

    try {
      normalizedPayments = parseSchoolPaymentLines(payments);
      built = await buildSchoolPaymentLines(orgId, studentId, academicYear, normalizedPayments);
    } catch (error) {
      res.status(400).json({
        success: false,
        data: null,
        message: error instanceof Error ? error.message : "Invalid payment request"
      });
      return;
    }

    let receiptNumber = generateReceiptNumber();
    let attempts = 0;
    while (await SchoolFeePayment.exists({ receiptNumber }) && attempts < 5) {
      receiptNumber = generateReceiptNumber();
      attempts += 1;
    }

    const payment = await SchoolFeePayment.create({
      organizationId: orgId,
      studentId,
      receiptNumber,
      academicYear,
      paymentDate: new Date(),
      paymentMode,
      upiTransactionId,
      collectedBy: authReq.user!.userId,
      feeHeadPayments: built.feeHeadPayments,
      totalAmountDue: built.totalAmountDue,
      totalAmountPaid: built.totalAmountPaid,
      totalLateFee: 0,
      notes
    });

    await applySchoolPaymentLinesToLedger(
      orgId,
      studentId,
      academicYear,
      normalizedPayments,
      payment._id
    );

    const fullPayment = await SchoolFeePayment.findById(payment._id)
      .populate("studentId", "name grade")
      .populate("collectedBy", "name");

    await invalidateOrgSchoolFeesCache(orgId);
    res.status(201).json({
      success: true,
      data: fullPayment,
      message: "School fees collected successfully"
    });
  })
);

schoolFeesRouter.get(
  "/receipt/:receiptNumber",
  ...scopeMiddleware,
  allowCollect,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const data = await buildReceiptView(
      getScopedOrganizationId(authReq, res)!,
      String(req.params.receiptNumber)
    );
    if (!data) {
      res.status(404).json({ success: false, data: null, message: "Receipt not found" });
      return;
    }
    res.json({ success: true, data, message: "Receipt fetched successfully" });
  })
);

schoolFeesRouter.get(
  "/history/:studentId",
  ...scopeMiddleware,
  allowCollect,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { academicYear } = req.query as { academicYear?: string };
    const studentId = String(req.params.studentId);

    const student = await Student.findOne({ _id: studentId, ...orgFilter(authReq, res) });
    if (!student) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    const filter: Record<string, unknown> = {
      ...orgFilter(authReq, res),
      studentId: new Types.ObjectId(studentId)
    };
    if (academicYear) {
      filter.academicYear = academicYear;
    }

    const { page, limit } = parsePaginationQuery(req.query, 20);
    const { data, pagination } = await paginate(SchoolFeePayment, filter, {
      page,
      limit,
      sort: { paymentDate: -1 },
      populate: { path: "collectedBy", select: "name" }
    });

    res.json({
      success: true,
      data,
      pagination,
      message: "Payment history fetched successfully"
    });
  })
);

schoolFeesRouter.get(
  "/summary",
  ...scopeMiddleware,
  allowCollect,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { month, academicYear } = req.query as { month?: string; academicYear?: string };

    if (!academicYear) {
      res.status(400).json({
        success: false,
        data: null,
        message: "academicYear is required"
      });
      return;
    }

    const orgId = getScopedOrganizationId(authReq, res)!;
    const monthKey = month ?? "all";
    const cacheKey = orgCacheKey(orgId, `school-fees:summary:${monthKey}:${academicYear}`);
    const cached = await getCached<Awaited<ReturnType<typeof buildOrgFeeSummary>>>(cacheKey);
    if (cached) {
      res.json({
        success: true,
        data: cached,
        message: "School fee summary fetched successfully"
      });
      return;
    }

    const data = await buildOrgFeeSummary(orgId, academicYear, month);
    await setCached(cacheKey, data, 300);

    res.json({
      success: true,
      data,
      message: "School fee summary fetched successfully"
    });
  })
);

export default schoolFeesRouter;
