import { Router } from "express";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import { canAccessOrg, isParent } from "../middleware/roleCheck";
import { SchoolFeePayment } from "../models/SchoolFeePayment";
import { Student } from "../models/Student";
import { StudentTransport } from "../models/StudentTransport";
import {
  buildReceiptView,
  buildStudentFeeLedgerView
} from "../services/schoolFeeService";
import { asyncHandler } from "../utils/asyncHandler";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";

const parentRouter = Router();

const guard = [auth, orgScope, requireOrgScope, canAccessOrg, isParent] as const;

const assertParentChild = (req: AuthenticatedRequest, studentId: string): boolean => {
  return !!req.user?.parentStudentIds?.includes(studentId);
};

parentRouter.get(
  "/children",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const childIds = authReq.user?.parentStudentIds ?? [];

    const children = await Student.find({
      ...orgFilter(authReq, res),
      _id: { $in: childIds }
    }).select("name grade status academicYear parentName parentPhone");

    const transports = await StudentTransport.find({
      ...orgFilter(authReq, res),
      studentId: { $in: childIds },
      status: "active"
    }).populate("busId", "busNumber routeName");

    const transportByStudent = new Map(
      transports.map((t) => [String(t.studentId), t])
    );

    const data = children.map((child) => {
      const transport = transportByStudent.get(String(child._id));
      const bus = transport?.busId as { busNumber?: string; routeName?: string } | null;
      return {
        ...child.toObject(),
        transport: transport
          ? {
              busNumber: bus?.busNumber,
              routeName: bus?.routeName,
              monthlyTransportFee: transport.monthlyTransportFee,
              pickupStop: transport.pickupStop
            }
          : null
      };
    });

    res.json({
      success: true,
      data,
      message: "Children fetched successfully"
    });
  })
);

parentRouter.get(
  "/children/:studentId/fees",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const studentId = String(req.params.studentId);
    const { academicYear } = req.query as { academicYear?: string };

    if (!assertParentChild(authReq, studentId)) {
      res.status(403).json({
        success: false,
        data: null,
        message: "Forbidden: not your child"
      });
      return;
    }

    const year =
      academicYear ||
      (await Student.findById(studentId).then((s) => s?.academicYear));

    if (!year) {
      res.status(400).json({
        success: false,
        data: null,
        message: "academicYear is required"
      });
      return;
    }

    const data = await buildStudentFeeLedgerView(
      getScopedOrganizationId(authReq, res)!,
      studentId,
      year
    );

    if (!data) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    res.json({
      success: true,
      data,
      message: "Child fee ledger fetched successfully"
    });
  })
);

parentRouter.get(
  "/children/:studentId/payments",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const studentId = String(req.params.studentId);
    const { academicYear } = req.query as { academicYear?: string };

    if (!assertParentChild(authReq, studentId)) {
      res.status(403).json({
        success: false,
        data: null,
        message: "Forbidden: not your child"
      });
      return;
    }

    const filter: Record<string, unknown> = {
      ...orgFilter(authReq, res),
      studentId
    };
    if (academicYear) {
      filter.academicYear = academicYear;
    }

    const payments = await SchoolFeePayment.find(filter)
      .select(
        "receiptNumber paymentDate paymentMode totalAmountPaid totalAmountDue feeHeadPayments notes"
      )
      .sort({ paymentDate: -1 });

    res.json({
      success: true,
      data: payments,
      message: "Payment history fetched successfully"
    });
  })
);

parentRouter.get(
  "/receipt/:receiptNumber",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const receiptNumber = String(req.params.receiptNumber);

    const payment = await SchoolFeePayment.findOne({
      organizationId: orgId,
      receiptNumber
    });

    if (!payment) {
      res.status(404).json({ success: false, data: null, message: "Receipt not found" });
      return;
    }

    if (!assertParentChild(authReq, payment.studentId.toString())) {
      res.status(403).json({
        success: false,
        data: null,
        message: "Forbidden: receipt does not belong to your child"
      });
      return;
    }

    const data = await buildReceiptView(orgId, receiptNumber);
    res.json({ success: true, data, message: "Receipt fetched successfully" });
  })
);

export default parentRouter;
