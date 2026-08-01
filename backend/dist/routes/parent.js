"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const SchoolFeePayment_1 = require("../models/SchoolFeePayment");
const Student_1 = require("../models/Student");
const StudentTransport_1 = require("../models/StudentTransport");
const schoolFeeService_1 = require("../services/schoolFeeService");
const schoolFeeCollection_1 = require("../services/schoolFeeCollection");
const asyncHandler_1 = require("../utils/asyncHandler");
const orgFilter_1 = require("../utils/orgFilter");
const parentRouter = (0, express_1.Router)();
const guard = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, roleCheck_1.canAccessOrg, roleCheck_1.isParent];
const assertParentChild = (req, studentId) => {
    return !!req.user?.parentStudentIds?.includes(studentId);
};
parentRouter.get("/children", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const childIds = authReq.user?.parentStudentIds ?? [];
    const children = await Student_1.Student.find({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        _id: { $in: childIds }
    }).select("name grade status academicYear parentName parentPhone");
    const transports = await StudentTransport_1.StudentTransport.find({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        studentId: { $in: childIds },
        status: "active"
    }).populate("busId", "busNumber routeName");
    const transportByStudent = new Map(transports.map((t) => [String(t.studentId), t]));
    const data = children.map((child) => {
        const transport = transportByStudent.get(String(child._id));
        const bus = transport?.busId;
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
}));
parentRouter.get("/children/:studentId/fees", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const studentId = String(req.params.studentId);
    const { academicYear } = req.query;
    if (!assertParentChild(authReq, studentId)) {
        res.status(403).json({
            success: false,
            data: null,
            message: "Forbidden: not your child"
        });
        return;
    }
    const year = academicYear ||
        (await Student_1.Student.findById(studentId).then((s) => s?.academicYear));
    if (!year) {
        res.status(400).json({
            success: false,
            data: null,
            message: "academicYear is required"
        });
        return;
    }
    const data = await (0, schoolFeeService_1.buildStudentFeeLedgerView)((0, orgFilter_1.getScopedOrganizationId)(authReq, res), studentId, year);
    if (!data) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    res.json({
        success: true,
        data,
        message: "Child fee ledger fetched successfully"
    });
}));
parentRouter.post("/children/:studentId/payment-intent", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const studentId = String(req.params.studentId);
    const { academicYear, payments, notes } = req.body;
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
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    try {
        const intent = await (0, schoolFeeCollection_1.createSchoolPaymentIntent)({
            organizationId: orgId,
            studentId,
            academicYear,
            payments,
            createdBy: authReq.user.userId,
            notes
        });
        res.status(201).json({
            success: true,
            data: intent,
            message: "Payment intent created"
        });
    }
    catch (error) {
        res.status(400).json({
            success: false,
            data: null,
            message: error instanceof Error ? error.message : "Invalid payment request"
        });
    }
}));
parentRouter.get("/children/:studentId/payments", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const studentId = String(req.params.studentId);
    const { academicYear } = req.query;
    if (!assertParentChild(authReq, studentId)) {
        res.status(403).json({
            success: false,
            data: null,
            message: "Forbidden: not your child"
        });
        return;
    }
    const filter = {
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        studentId
    };
    if (academicYear) {
        filter.academicYear = academicYear;
    }
    const payments = await SchoolFeePayment_1.SchoolFeePayment.find(filter)
        .select("receiptNumber paymentDate paymentMode totalAmountPaid totalAmountDue feeHeadPayments notes")
        .sort({ paymentDate: -1 });
    res.json({
        success: true,
        data: payments,
        message: "Payment history fetched successfully"
    });
}));
parentRouter.get("/receipt/:receiptNumber", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const receiptNumber = String(req.params.receiptNumber);
    const payment = await SchoolFeePayment_1.SchoolFeePayment.findOne({
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
    const data = await (0, schoolFeeService_1.buildReceiptView)(orgId, receiptNumber);
    res.json({ success: true, data, message: "Receipt fetched successfully" });
}));
exports.default = parentRouter;
