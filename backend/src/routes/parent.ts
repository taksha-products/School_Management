import { Router } from "express";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import { isOrgFeatureEnabled, requireFeature } from "../middleware/featureFlag";
import { canAccessOrg, isParent } from "../middleware/roleCheck";
import { Bus } from "../models/Bus";
import { SchoolFeePayment } from "../models/SchoolFeePayment";
import { Student } from "../models/Student";
import { StudentTransport } from "../models/StudentTransport";
import {
  getParentBusTrail,
  getParentBusView,
  resolveOwnedChild
} from "../services/parentBusService";
import {
  createSchoolPaymentIntent,
  type SchoolPaymentLineBody
} from "../services/schoolFeeCollection";
import {
  buildReceiptView,
  buildStudentFeeLedgerView
} from "../services/schoolFeeService";
import { asyncHandler } from "../utils/asyncHandler";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";

// Ensure Bus is registered for transport.busId populate.
void Bus;

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

    const orgId = getScopedOrganizationId(authReq, res)!;
    const [gpsEnabled, portalEnabled] = await Promise.all([
      isOrgFeatureEnabled(orgId, "gpsTracking"),
      isOrgFeatureEnabled(orgId, "parentPortal")
    ]);
    const trackingEnabled = gpsEnabled === true && portalEnabled === true;

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
              pickupStop: transport.pickupStop,
              dropStop: transport.dropStop,
              trackingEnabled
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

parentRouter.post(
  "/children/:studentId/payment-intent",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const studentId = String(req.params.studentId);
    const { academicYear, payments, notes } = req.body as {
      academicYear?: string;
      payments?: SchoolPaymentLineBody[];
      notes?: string;
    };

    if (!assertParentChild(authReq, studentId)) {
      res.status(403).json({
        success: false,
        data: null,
        message: "Forbidden: not your child"
      });
      return;
    }

    if (!academicYear || !Array.isArray(payments) || payments.length === 0) {
      res.status(400).json({
        success: false,
        data: null,
        message: "academicYear and payments[] are required"
      });
      return;
    }

    const orgId = getScopedOrganizationId(authReq, res)!;

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

const busGuard = [
  ...guard,
  requireFeature("gpsTracking"),
  requireFeature("parentPortal")
] as const;

/**
 * Resolves the child for a bus request. The parent-child link and the child's active status
 * are checked against the database (not only the token), because assignments change while a
 * token is still valid. Callers answer 404 for any child that is not the caller's, so the API
 * never confirms whether another family's child exists.
 */
const resolveOwnChild = (
  req: AuthenticatedRequest,
  organizationId: string,
  studentId: string
): Promise<{ id: string; name: string } | null> =>
  resolveOwnedChild({ organizationId, parentUserId: req.user!.userId, studentId });

parentRouter.get(
  "/children/:studentId/bus",
  ...busGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const organizationId = getScopedOrganizationId(authReq, res)!;
    const child = await resolveOwnChild(authReq, organizationId, String(req.params.studentId));

    if (!child) {
      res.status(404).json({ success: false, data: null, message: "Child not found" });
      return;
    }

    const data = await getParentBusView({
      organizationId,
      studentId: child.id,
      studentName: child.name
    });

    res.json({ success: true, data, message: "Bus status fetched successfully" });
  })
);

parentRouter.get(
  "/children/:studentId/bus/trail",
  ...busGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const organizationId = getScopedOrganizationId(authReq, res)!;
    const child = await resolveOwnChild(authReq, organizationId, String(req.params.studentId));

    if (!child) {
      res.status(404).json({ success: false, data: null, message: "Child not found" });
      return;
    }

    const view = await getParentBusView({
      organizationId,
      studentId: child.id,
      studentName: child.name
    });

    const points =
      view.state === "running" && view.bus
        ? await getParentBusTrail({ organizationId, busId: view.bus.busId })
        : [];

    res.json({ success: true, data: { points }, message: "Bus trail fetched successfully" });
  })
);

export default parentRouter;
