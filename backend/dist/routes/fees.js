"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const auth_1 = require("../middleware/auth");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const FeeGroup_1 = require("../models/FeeGroup");
const FeePayment_1 = require("../models/FeePayment");
const Student_1 = require("../models/Student");
const asyncHandler_1 = require("../utils/asyncHandler");
const cache_1 = require("../utils/cache");
const orgFilter_1 = require("../utils/orgFilter");
const paginate_1 = require("../utils/paginate");
const monthKeyNow = () => new Date().toISOString().slice(0, 7);
const sortMonths = (months) => [...new Set(months)].sort((a, b) => a.localeCompare(b));
const distributeAdvanceAcrossMonths = (sortedMonths, monthlyFee, cashPaid) => {
    const totalDue = monthlyFee * sortedMonths.length;
    const out = new Map();
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
        }
        else if (remaining > 0) {
            out.set(m, { status: "partial", amountPaid: remaining, paidAt: new Date() });
            remaining = 0;
        }
        else {
            let status = "pending";
            if (m < nowKey) {
                status = "overdue";
            }
            out.set(m, { status, amountPaid: 0 });
        }
    }
    return out;
};
const feesRouter = (0, express_1.Router)();
const scopeMiddleware = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, roleCheck_1.canAccessOrg];
const allowFeeRead = (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    if (authReq.user?.role === "parent") {
        (0, roleCheck_1.isParent)(req, res, next);
        return;
    }
    (0, roleCheck_1.isSuperAdminOrOrgStaffAny)("canCollectFees", "canViewReports")(req, res, next);
};
const generateMonthlyFeePayments = async (organizationId, month, academicYear) => {
    const studentFilter = {
        organizationId: new mongoose_1.Types.ObjectId(organizationId),
        status: "active"
    };
    if (academicYear) {
        studentFilter.academicYear = academicYear;
    }
    const students = await Student_1.Student.find(studentFilter);
    const nowMonthKey = new Date().toISOString().slice(0, 7);
    let createdCount = 0;
    let updatedCount = 0;
    for (const student of students) {
        const existing = await FeePayment_1.FeePayment.findOne({
            organizationId: student.organizationId,
            studentId: student._id,
            month,
            academicYear: student.academicYear
        });
        if (!existing) {
            const status = month < nowMonthKey ? "overdue" : "pending";
            await FeePayment_1.FeePayment.create({
                organizationId: student.organizationId,
                studentId: student._id,
                busId: student.busId,
                month,
                academicYear: student.academicYear,
                amount: student.monthlyFee,
                amountPaid: 0,
                status
            });
            createdCount += 1;
        }
        else if (month < nowMonthKey && existing.status === "pending") {
            existing.status = "overdue";
            await existing.save();
            updatedCount += 1;
        }
    }
    return { createdCount, updatedCount, totalStudents: students.length };
};
feesRouter.get("/", ...scopeMiddleware, allowFeeRead, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { month, busId } = req.query;
    if (!month) {
        res.status(400).json({ success: false, data: null, message: "month is required" });
        return;
    }
    const filter = { ...(0, orgFilter_1.orgFilter)(authReq, res), month };
    if (busId) {
        filter.busId = busId;
    }
    if (authReq.user?.role === "parent") {
        const parentIds = authReq.user.parentStudentIds ?? [];
        filter.studentId = { $in: parentIds.map((id) => new mongoose_1.Types.ObjectId(id)) };
    }
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const existingCount = await FeePayment_1.FeePayment.countDocuments(filter);
    if (existingCount === 0 && authReq.user?.role !== "parent") {
        await generateMonthlyFeePayments(orgId, month);
        (0, cache_1.invalidateOrgReportsCache)(orgId);
    }
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 50);
    const { data, pagination } = await (0, paginate_1.paginate)(FeePayment_1.FeePayment, filter, {
        page,
        limit,
        sort: { createdAt: -1 },
        populate: [
            { path: "studentId", select: "name grade monthlyFee" },
            { path: "busId", select: "busNumber" }
        ]
    });
    res.json({
        success: true,
        data,
        pagination,
        message: "Fee payments fetched successfully"
    });
}));
feesRouter.post("/record", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canCollectFees"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { studentId, month, academicYear, amountPaid } = req.body;
    if (!studentId || !month || !academicYear || amountPaid === undefined) {
        res.status(400).json({
            success: false,
            data: null,
            message: "studentId, month, academicYear and amountPaid are required"
        });
        return;
    }
    const student = await Student_1.Student.findOne({ _id: studentId, ...(0, orgFilter_1.orgFilter)(authReq, res) });
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    const monthlyFee = student.monthlyFee;
    const status = amountPaid >= monthlyFee ? "paid" : amountPaid > 0 ? "partial" : "pending";
    const payment = await FeePayment_1.FeePayment.findOneAndUpdate({ studentId, month, academicYear }, {
        organizationId: student.organizationId,
        studentId,
        busId: student.busId,
        month,
        academicYear,
        amount: monthlyFee,
        amountPaid,
        status,
        paidAt: status === "pending" ? undefined : new Date(),
        collectedBy: authReq.user?.userId,
        paymentType: "single"
    }, { new: true, upsert: true, setDefaultsOnInsert: true })
        .populate("studentId", "name grade monthlyFee")
        .populate("busId", "busNumber")
        .populate("collectedBy", "name role");
    (0, cache_1.invalidateOrgReportsCache)(String(student.organizationId));
    res.json({ success: true, data: payment, message: "Fee payment recorded successfully" });
}));
feesRouter.post("/record-advance", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canCollectFees"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { studentId, months, amountPaid, academicYear, notes } = req.body;
    if (!studentId ||
        !Array.isArray(months) ||
        months.length === 0 ||
        academicYear === undefined ||
        amountPaid === undefined) {
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
    const student = await Student_1.Student.findOne({ _id: studentId, ...(0, orgFilter_1.orgFilter)(authReq, res) });
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
    const monthlyFee = student.monthlyFee;
    const totalDue = monthlyFee * sortedMonths.length;
    const alreadyPaid = await FeePayment_1.FeePayment.findOne({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
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
    const feeGroupDoc = await FeeGroup_1.FeeGroup.create({
        organizationId: student.organizationId,
        studentId: student._id,
        busId: student.busId,
        months: sortedMonths,
        totalAmount: amountPaid,
        totalDue,
        academicYear,
        collectedBy: authReq.user?.userId ? new mongoose_1.Types.ObjectId(authReq.user.userId) : undefined,
        collectedAt: new Date(),
        notes
    });
    feeGroupDoc.receiptNumber = `GRP-${String(feeGroupDoc._id).slice(-6).toUpperCase()}`;
    await feeGroupDoc.save();
    const paymentsOut = [];
    for (const month of sortedMonths) {
        const alloc = allocation.get(month);
        if (!alloc) {
            continue;
        }
        const existing = await FeePayment_1.FeePayment.findOne({
            studentId: student._id,
            month,
            academicYear
        });
        if (existing?.status === "paid") {
            continue;
        }
        const paidAt = alloc.paidAt;
        const updated = await FeePayment_1.FeePayment.findOneAndUpdate({ studentId: student._id, month, academicYear }, {
            organizationId: student.organizationId,
            studentId: student._id,
            busId: student.busId,
            month,
            academicYear,
            amount: monthlyFee,
            amountPaid: alloc.amountPaid,
            status: alloc.status,
            paidAt,
            collectedBy: authReq.user?.userId ? new mongoose_1.Types.ObjectId(authReq.user.userId) : undefined,
            notes: notes ?? existing?.notes,
            feeGroupId: feeGroupDoc._id,
            paymentType: "advance"
        }, { new: true, upsert: true, setDefaultsOnInsert: true })
            .populate("studentId", "name grade monthlyFee")
            .populate("busId", "busNumber")
            .populate("collectedBy", "name role");
        if (updated) {
            paymentsOut.push(updated);
        }
    }
    const feeGroup = await FeeGroup_1.FeeGroup.findById(feeGroupDoc._id).populate("collectedBy", "name");
    (0, cache_1.invalidateOrgReportsCache)(String(student.organizationId));
    res.status(201).json({
        success: true,
        data: { feeGroup, payments: paymentsOut },
        message: "Advance fee payment recorded successfully"
    });
}));
feesRouter.get("/student/:studentId", ...scopeMiddleware, allowFeeRead, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const studentId = String(req.params.studentId);
    if (!mongoose_1.Types.ObjectId.isValid(studentId)) {
        res.status(400).json({ success: false, data: null, message: "Invalid student id" });
        return;
    }
    if (authReq.user?.role === "parent" &&
        !authReq.user.parentStudentIds?.includes(studentId)) {
        res.status(403).json({
            success: false,
            data: null,
            message: "Forbidden: cannot access this student's fees"
        });
        return;
    }
    const student = await Student_1.Student.findOne({ _id: studentId, ...(0, orgFilter_1.orgFilter)(authReq, res) });
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    const payments = await FeePayment_1.FeePayment.find({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        studentId: new mongoose_1.Types.ObjectId(studentId)
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
}));
feesRouter.get("/generate-monthly", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canCollectFees"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { month, academicYear } = req.query;
    if (!month || !academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "month and academicYear are required"
        });
        return;
    }
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { createdCount, updatedCount, totalStudents } = await generateMonthlyFeePayments(orgId, month, academicYear);
    if (createdCount > 0 || updatedCount > 0) {
        (0, cache_1.invalidateOrgReportsCache)(orgId);
    }
    res.json({
        success: true,
        data: { createdCount, updatedCount, totalStudents },
        message: "Monthly fee generation completed"
    });
}));
const buildReceiptData = async (paymentId, orgScopeFilter) => {
    const payment = await FeePayment_1.FeePayment.findOne({ _id: paymentId, ...orgScopeFilter })
        .populate("studentId", "name monthlyFee grade")
        .populate("busId", "busNumber")
        .populate("collectedBy", "name");
    if (!payment) {
        return null;
    }
    const student = payment.studentId;
    const bus = payment.busId;
    const collector = payment.collectedBy;
    const base = {
        studentName: student?.name,
        grade: student?.grade,
        busNumber: bus?.busNumber,
        month: payment.month,
        monthlyFee: student?.monthlyFee ?? payment.amount,
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
    const group = await FeeGroup_1.FeeGroup.findById(payment.feeGroupId);
    const groupPayments = await FeePayment_1.FeePayment.find({ feeGroupId: payment.feeGroupId }).sort({
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
feesRouter.get("/receipt/:paymentId", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canCollectFees"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const data = await buildReceiptData(String(req.params.paymentId), (0, orgFilter_1.orgFilter)(authReq, res));
    if (!data) {
        res.status(404).json({ success: false, data: null, message: "Payment not found" });
        return;
    }
    res.json({
        success: true,
        data,
        message: "Receipt generated successfully"
    });
}));
feesRouter.post("/receipt/:paymentId", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canCollectFees"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const data = await buildReceiptData(String(req.params.paymentId), (0, orgFilter_1.orgFilter)(authReq, res));
    if (!data) {
        res.status(404).json({ success: false, data: null, message: "Payment not found" });
        return;
    }
    res.json({
        success: true,
        data,
        message: "Receipt generated successfully"
    });
}));
exports.default = feesRouter;
