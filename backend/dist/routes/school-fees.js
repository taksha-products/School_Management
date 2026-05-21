"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const auth_1 = require("../middleware/auth");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const FeeLedger_1 = require("../models/FeeLedger");
const SchoolFeePayment_1 = require("../models/SchoolFeePayment");
const Student_1 = require("../models/Student");
const schoolFeeService_1 = require("../services/schoolFeeService");
const asyncHandler_1 = require("../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const cache_1 = require("../utils/cache");
const orgFilter_1 = require("../utils/orgFilter");
const paginate_1 = require("../utils/paginate");
const schoolFees_1 = require("../validators/schoolFees");
const schoolFeeLedger_1 = require("../utils/schoolFeeLedger");
const schoolFeesRouter = (0, express_1.Router)();
const scopeMiddleware = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, roleCheck_1.canAccessOrg];
const allowCollect = (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isSuperAdminOrOrgStaff)("canCollectFees")(req, res, next);
};
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
    const feeHeadPayments = [];
    let totalAmountDue = 0;
    let totalAmountPaid = 0;
    let totalLateFee = 0;
    const updatedLedgerIds = [];
    for (const item of payments) {
        const ledger = await FeeLedger_1.FeeLedger.findOne({
            organizationId: new mongoose_1.Types.ObjectId(orgId),
            studentId: new mongoose_1.Types.ObjectId(studentId),
            academicYear,
            feeHeadName: item.feeHeadName,
            periodLabel: item.periodLabel
        });
        if (!ledger) {
            res.status(400).json({
                success: false,
                data: null,
                message: `No ledger entry for ${item.feeHeadName} / ${item.periodLabel}`
            });
            return;
        }
        const payAmount = item.amountPaid ?? 0;
        const lateFeeAdd = item.lateFee ?? 0;
        const newPaid = ledger.amountPaid + payAmount;
        const newLateFee = ledger.lateFee + lateFeeAdd;
        const lineStatus = newPaid >= ledger.amountDue + newLateFee ? "paid" : "partial";
        ledger.amountPaid = newPaid;
        ledger.lateFee = newLateFee;
        ledger.status = (0, schoolFeeLedger_1.computeLedgerStatus)(ledger.amountDue, newPaid, ledger.dueDate, newLateFee);
        await ledger.save();
        updatedLedgerIds.push(ledger._id);
        feeHeadPayments.push({
            feeHeadName: item.feeHeadName,
            periodLabel: item.periodLabel,
            amountDue: ledger.amountDue,
            amountPaid: payAmount,
            lateFee: lateFeeAdd,
            status: lineStatus
        });
        totalAmountDue += ledger.amountDue;
        totalAmountPaid += payAmount;
        totalLateFee += lateFeeAdd;
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
        feeHeadPayments,
        totalAmountDue,
        totalAmountPaid,
        totalLateFee,
        notes
    });
    await FeeLedger_1.FeeLedger.updateMany({ _id: { $in: updatedLedgerIds } }, { $set: { paymentId: payment._id } });
    const fullPayment = await SchoolFeePayment_1.SchoolFeePayment.findById(payment._id)
        .populate("studentId", "name grade")
        .populate("collectedBy", "name");
    (0, cache_1.invalidateOrgSchoolFeesCache)(orgId);
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
    const cacheKey = `${orgId}:school-fees:summary:${monthKey}:${academicYear}`;
    const cached = (0, cache_1.cacheGet)(cacheKey);
    if (cached) {
        res.json({
            success: true,
            data: cached,
            message: "School fee summary fetched successfully"
        });
        return;
    }
    const data = await (0, schoolFeeService_1.buildOrgFeeSummary)(orgId, academicYear, month);
    (0, cache_1.cacheSet)(cacheKey, data, 300);
    res.json({
        success: true,
        data,
        message: "School fee summary fetched successfully"
    });
}));
exports.default = schoolFeesRouter;
