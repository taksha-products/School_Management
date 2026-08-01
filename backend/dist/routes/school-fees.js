"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const auth_1 = require("../middleware/auth");
const featureFlag_1 = require("../middleware/featureFlag");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const FeeLedger_1 = require("../models/FeeLedger");
const SchoolFeePayment_1 = require("../models/SchoolFeePayment");
const Student_1 = require("../models/Student");
const schoolFeeService_1 = require("../services/schoolFeeService");
const schoolFeeCollection_1 = require("../services/schoolFeeCollection");
const schoolFeeAssignmentService_1 = require("../services/schoolFeeAssignmentService");
const asyncHandler_1 = require("../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const cache_1 = require("../utils/cache");
const orgFilter_1 = require("../utils/orgFilter");
const paginate_1 = require("../utils/paginate");
const schoolFees_1 = require("../validators/schoolFees");
const schoolFeeLedger_1 = require("../utils/schoolFeeLedger");
const schoolFeesRouter = (0, express_1.Router)();
const scopeMiddleware = [
    auth_1.auth,
    orgScope_1.orgScope,
    requireOrgScope_1.requireOrgScope,
    roleCheck_1.canAccessOrg,
    (0, featureFlag_1.requireFeature)("schoolFees")
];
const allowCollect = (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isSuperAdminOrOrgStaff)("canCollectFees")(req, res, next);
};
const allowManageStudents = (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin" || authReq.user?.role === "orgAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isSuperAdminOrOrgStaff)("canManageStudents")(req, res, next);
};
schoolFeesRouter.post("/assign/preview", ...scopeMiddleware, allowManageStudents, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const outcome = await (0, schoolFeeAssignmentService_1.previewAssignFeeStructure)(orgId, req.body);
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
}));
schoolFeesRouter.post("/assign", ...scopeMiddleware, allowManageStudents, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const outcome = await (0, schoolFeeAssignmentService_1.executeAssignFeeStructure)(orgId, req.body);
    if (!outcome.ok) {
        res.status(outcome.status).json({
            success: false,
            data: null,
            message: outcome.message
        });
        return;
    }
    await (0, cache_1.invalidateOrgSchoolFeesCache)(orgId);
    res.json({
        success: true,
        data: outcome.result,
        message: `Fees assigned to ${outcome.result.assigned} student(s) successfully`
    });
}));
schoolFeesRouter.post("/payment-intent", ...scopeMiddleware, allowCollect, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { studentId, academicYear, payments, notes } = req.body;
    if (!studentId || !academicYear || !Array.isArray(payments) || payments.length === 0) {
        res.status(400).json({
            success: false,
            data: null,
            message: "studentId, academicYear, and payments[] are required"
        });
        return;
    }
    const student = await Student_1.Student.findOne({ _id: studentId, ...(0, orgFilter_1.orgFilter)(authReq, res) });
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
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
schoolFeesRouter.get("/ledger", ...scopeMiddleware, allowCollect, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { studentId, academicYear } = req.query;
    if (!studentId || !academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "studentId and academicYear are required"
        });
        return;
    }
    const data = await (0, schoolFeeService_1.buildStudentFeeLedgerView)(orgId, studentId, academicYear);
    if (!data) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    res.json({
        success: true,
        data,
        message: "Fee ledger fetched successfully"
    });
}));
schoolFeesRouter.get("/student-fee-status", ...scopeMiddleware, allowCollect, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { academicYear } = req.query;
    if (!academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "academicYear is required"
        });
        return;
    }
    const statusMap = await (0, schoolFeeService_1.buildStudentFeeStatusMap)(orgId, academicYear);
    res.json({
        success: true,
        data: statusMap,
        message: "Student fee status fetched successfully"
    });
}));
schoolFeesRouter.get("/outstanding", ...scopeMiddleware, allowCollect, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { grade, feeHeadName, academicYear } = req.query;
    if (!academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "academicYear is required"
        });
        return;
    }
    await (0, schoolFeeLedger_1.refreshOverdueStatuses)({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        academicYear
    });
    const ledgerFilter = {
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        academicYear
    };
    if (feeHeadName) {
        ledgerFilter.feeHeadName = feeHeadName;
    }
    const entries = await FeeLedger_1.FeeLedger.find(ledgerFilter).populate("studentId", "name grade");
    const byStudent = new Map();
    for (const entry of entries) {
        const student = entry.studentId;
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
        const row = byStudent.get(key);
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
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 50);
    const { data, pagination } = (0, paginate_1.paginateArray)(results, page, limit);
    res.json({
        success: true,
        data,
        pagination,
        message: "Outstanding dues fetched successfully"
    });
}));
schoolFeesRouter.post("/collect", ...scopeMiddleware, allowCollect, schoolFees_1.collectSchoolFeesValidation, validate_1.validate, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { studentId, academicYear, paymentMode, upiTransactionId, payments, notes } = req.body;
    if (!studentId ||
        !academicYear ||
        !paymentMode ||
        !Array.isArray(payments) ||
        payments.length === 0) {
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
    const student = await Student_1.Student.findOne({ _id: studentId, ...(0, orgFilter_1.orgFilter)(authReq, res) });
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    let built;
    let normalizedPayments;
    try {
        normalizedPayments = (0, schoolFeeCollection_1.parseSchoolPaymentLines)(payments);
        built = await (0, schoolFeeCollection_1.buildSchoolPaymentLines)(orgId, studentId, academicYear, normalizedPayments);
    }
    catch (error) {
        res.status(400).json({
            success: false,
            data: null,
            message: error instanceof Error ? error.message : "Invalid payment request"
        });
        return;
    }
    let receiptNumber = (0, schoolFeeLedger_1.generateReceiptNumber)();
    let attempts = 0;
    while (await SchoolFeePayment_1.SchoolFeePayment.exists({ receiptNumber }) && attempts < 5) {
        receiptNumber = (0, schoolFeeLedger_1.generateReceiptNumber)();
        attempts += 1;
    }
    const payment = await SchoolFeePayment_1.SchoolFeePayment.create({
        organizationId: orgId,
        studentId,
        receiptNumber,
        academicYear,
        paymentDate: new Date(),
        paymentMode,
        upiTransactionId,
        collectedBy: authReq.user.userId,
        feeHeadPayments: built.feeHeadPayments,
        totalAmountDue: built.totalAmountDue,
        totalAmountPaid: built.totalAmountPaid,
        totalLateFee: 0,
        notes
    });
    await (0, schoolFeeCollection_1.applySchoolPaymentLinesToLedger)(orgId, studentId, academicYear, normalizedPayments, payment._id);
    const fullPayment = await SchoolFeePayment_1.SchoolFeePayment.findById(payment._id)
        .populate("studentId", "name grade")
        .populate("collectedBy", "name");
    await (0, cache_1.invalidateOrgSchoolFeesCache)(orgId);
    res.status(201).json({
        success: true,
        data: fullPayment,
        message: "School fees collected successfully"
    });
}));
schoolFeesRouter.get("/receipt/:receiptNumber", ...scopeMiddleware, allowCollect, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const data = await (0, schoolFeeService_1.buildReceiptView)((0, orgFilter_1.getScopedOrganizationId)(authReq, res), String(req.params.receiptNumber));
    if (!data) {
        res.status(404).json({ success: false, data: null, message: "Receipt not found" });
        return;
    }
    res.json({ success: true, data, message: "Receipt fetched successfully" });
}));
schoolFeesRouter.get("/history/:studentId", ...scopeMiddleware, allowCollect, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { academicYear } = req.query;
    const studentId = String(req.params.studentId);
    const student = await Student_1.Student.findOne({ _id: studentId, ...(0, orgFilter_1.orgFilter)(authReq, res) });
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    const filter = {
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        studentId: new mongoose_1.Types.ObjectId(studentId)
    };
    if (academicYear) {
        filter.academicYear = academicYear;
    }
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 20);
    const { data, pagination } = await (0, paginate_1.paginate)(SchoolFeePayment_1.SchoolFeePayment, filter, {
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
}));
schoolFeesRouter.get("/summary", ...scopeMiddleware, allowCollect, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { month, academicYear } = req.query;
    if (!academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "academicYear is required"
        });
        return;
    }
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const monthKey = month ?? "all";
    const cacheKey = (0, cache_1.orgCacheKey)(orgId, `school-fees:summary:${monthKey}:${academicYear}`);
    const cached = await (0, cache_1.getCached)(cacheKey);
    if (cached) {
        res.json({
            success: true,
            data: cached,
            message: "School fee summary fetched successfully"
        });
        return;
    }
    const data = await (0, schoolFeeService_1.buildOrgFeeSummary)(orgId, academicYear, month);
    await (0, cache_1.setCached)(cacheKey, data, 300);
    res.json({
        success: true,
        data,
        message: "School fee summary fetched successfully"
    });
}));
exports.default = schoolFeesRouter;
