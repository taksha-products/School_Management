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
const SchoolFeePayment_1 = require("../models/SchoolFeePayment");
const Student_1 = require("../models/Student");
const StudentTransport_1 = require("../models/StudentTransport");
const asyncHandler_1 = require("../utils/asyncHandler");
const payment_1 = require("../types/payment");
const orgThemeService_1 = require("../services/orgThemeService");
const cache_1 = require("../utils/cache");
const orgFilter_1 = require("../utils/orgFilter");
const paginate_1 = require("../utils/paginate");
const monthKeyNow = () => new Date().toISOString().slice(0, 7);
const sortMonths = (months) => [...new Set(months)].sort((a, b) => a.localeCompare(b));
const addCalendarMonths = (monthKey, offset) => {
    const [yearStr, monthStr] = monthKey.split("-");
    const date = new Date(Number(yearStr), Number(monthStr) - 1 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const normalizeAdvancePaymentMode = (mode) => {
    if (mode && payment_1.PAYMENT_MODE_VALUES.includes(mode)) {
        return mode;
    }
    if (mode === "upi") {
        return "upi_office";
    }
    return "cash";
};
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
    const transportFilter = {
        organizationId: new mongoose_1.Types.ObjectId(organizationId),
        status: "active"
    };
    if (academicYear) {
        transportFilter.academicYear = academicYear;
    }
    const transports = await StudentTransport_1.StudentTransport.find(transportFilter);
    const nowMonthKey = new Date().toISOString().slice(0, 7);
    let createdCount = 0;
    let updatedCount = 0;
    for (const transport of transports) {
        const existing = await FeePayment_1.FeePayment.findOne({
            organizationId: transport.organizationId,
            studentId: transport.studentId,
            month,
            academicYear: transport.academicYear
        });
        if (!existing) {
            const status = month < nowMonthKey ? "overdue" : "pending";
            await FeePayment_1.FeePayment.create({
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
        }
        else if (month < nowMonthKey && existing.status === "pending") {
            existing.status = "overdue";
            await existing.save();
            updatedCount += 1;
        }
    }
    return { createdCount, updatedCount, totalStudents: transports.length };
};
feesRouter.get("/", ...scopeMiddleware, allowFeeRead, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { month, busId, academicYear, status } = req.query;
    if (!month) {
        res.status(400).json({ success: false, data: null, message: "month is required" });
        return;
    }
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const transportFilter = {
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        status: "active"
    };
    if (busId && mongoose_1.Types.ObjectId.isValid(busId)) {
        transportFilter.busId = new mongoose_1.Types.ObjectId(busId);
    }
    if (academicYear) {
        transportFilter.academicYear = academicYear;
    }
    const activeTransports = await StudentTransport_1.StudentTransport.find(transportFilter).select("studentId");
    const transportStudentIds = activeTransports.map((t) => t.studentId);
    const filter = {
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        month,
        studentId: { $in: transportStudentIds }
    };
    if (busId && mongoose_1.Types.ObjectId.isValid(busId)) {
        filter.busId = busId;
    }
    if (status === "pending") {
        filter.status = { $in: ["pending", "overdue"] };
    }
    else if (status) {
        filter.status = status;
    }
    if (authReq.user?.role === "parent") {
        const parentIds = authReq.user.parentStudentIds ?? [];
        filter.studentId = {
            $in: transportStudentIds.filter((id) => parentIds.includes(String(id)))
        };
    }
    const existingCount = await FeePayment_1.FeePayment.countDocuments(filter);
    if (existingCount === 0 && authReq.user?.role !== "parent" && transportStudentIds.length > 0) {
        await generateMonthlyFeePayments(orgId, month, academicYear);
        await (0, cache_1.invalidateOrgReportsCache)(orgId);
    }
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 50);
    const { data, pagination } = await (0, paginate_1.paginate)(FeePayment_1.FeePayment, filter, {
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
    const transport = await StudentTransport_1.StudentTransport.findOne({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
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
    const status = amountPaid >= monthlyFee ? "paid" : amountPaid > 0 ? "partial" : "pending";
    const payment = await FeePayment_1.FeePayment.findOneAndUpdate({ studentId, month, academicYear }, {
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
    }, { new: true, upsert: true, setDefaultsOnInsert: true })
        .populate("studentId", "name grade")
        .populate("busId", "busNumber")
        .populate("collectedBy", "name role");
    await (0, cache_1.invalidateOrgReportsCache)(String(student.organizationId));
    res.json({ success: true, data: payment, message: "Fee payment recorded successfully" });
}));
feesRouter.post("/record-advance", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canCollectFees"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { studentId, months, amountPaid, academicYear, notes, paymentMode } = req.body;
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
    if (sortedMonths.length < 1 || sortedMonths.length > 12) {
        res.status(400).json({
            success: false,
            data: null,
            message: "months must contain between 1 and 12 unique YYYY-MM values"
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
    const transport = await StudentTransport_1.StudentTransport.findOne({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
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
    const resolvedPaymentMode = normalizeAdvancePaymentMode(paymentMode);
    const monthDueAmounts = new Map();
    let totalDue = 0;
    for (const month of sortedMonths) {
        const existing = await FeePayment_1.FeePayment.findOne({
            ...(0, orgFilter_1.orgFilter)(authReq, res),
            studentId: student._id,
            academicYear,
            month
        });
        if (existing?.status === "paid") {
            res.status(400).json({
                success: false,
                data: null,
                message: `Month ${month} is already fully paid`
            });
            return;
        }
        if (existing && existing.amountPaid > 0) {
            res.status(400).json({
                success: false,
                data: null,
                message: `Month ${month} has a partial payment — use single-month Collect to finish it`
            });
            return;
        }
        const due = existing
            ? Math.max(0, existing.amount - existing.amountPaid)
            : monthlyFee;
        monthDueAmounts.set(month, due);
        totalDue += due;
    }
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
        res.status(400).json({
            success: false,
            data: null,
            message: "amountPaid must be a positive number"
        });
        return;
    }
    if (amountPaid !== totalDue) {
        res.status(400).json({
            success: false,
            data: null,
            message: `amountPaid must equal ${totalDue} for the selected months`
        });
        return;
    }
    const allocation = distributeAdvanceAcrossMonths(sortedMonths, monthlyFee, amountPaid);
    const feeGroupDoc = await FeeGroup_1.FeeGroup.create({
        organizationId: student.organizationId,
        studentId: student._id,
        busId: transport.busId,
        transportId: transport._id,
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
            busId: transport.busId,
            transportId: transport._id,
            month,
            academicYear,
            amount: monthlyFee,
            amountPaid: alloc.amountPaid,
            status: alloc.status,
            paidAt,
            collectedBy: authReq.user?.userId ? new mongoose_1.Types.ObjectId(authReq.user.userId) : undefined,
            notes: notes ?? existing?.notes,
            feeGroupId: feeGroupDoc._id,
            paymentType: "advance",
            paymentMode: resolvedPaymentMode
        }, { new: true, upsert: true, setDefaultsOnInsert: true })
            .populate("studentId", "name grade")
            .populate("busId", "busNumber")
            .populate("collectedBy", "name role");
        if (updated) {
            paymentsOut.push(updated);
        }
    }
    const feeGroup = await FeeGroup_1.FeeGroup.findById(feeGroupDoc._id).populate("collectedBy", "name");
    await (0, cache_1.invalidateOrgReportsCache)(String(student.organizationId));
    const primaryPayment = paymentsOut[0];
    res.status(201).json({
        success: true,
        data: {
            feeGroup,
            payments: paymentsOut,
            primaryPaymentId: primaryPayment?._id ? String(primaryPayment._id) : null
        },
        message: "Advance fee payment recorded successfully"
    });
}));
feesRouter.get("/transport/student/:studentId", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canCollectFees"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const studentId = String(req.params.studentId);
    const { academicYear, fromMonth } = req.query;
    if (!mongoose_1.Types.ObjectId.isValid(studentId)) {
        res.status(400).json({ success: false, data: null, message: "Invalid student id" });
        return;
    }
    if (!academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "academicYear query parameter is required"
        });
        return;
    }
    const student = await Student_1.Student.findOne({ _id: studentId, ...(0, orgFilter_1.orgFilter)(authReq, res) });
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    const transport = await StudentTransport_1.StudentTransport.findOne({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        studentId: student._id,
        status: "active",
        academicYear
    }).populate("busId", "busNumber routeName");
    if (!transport) {
        res.status(400).json({
            success: false,
            data: null,
            message: "Student is not on active transport for this academic year"
        });
        return;
    }
    const startMonth = fromMonth && /^\d{4}-\d{2}$/.test(fromMonth) ? fromMonth : monthKeyNow();
    const monthKeys = Array.from({ length: 12 }, (_, index) => addCalendarMonths(startMonth, index));
    const existingPayments = await FeePayment_1.FeePayment.find({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        studentId: student._id,
        academicYear,
        month: { $in: monthKeys }
    });
    const paymentByMonth = new Map(existingPayments.map((p) => [p.month, p]));
    const nowKey = monthKeyNow();
    const months = monthKeys.map((month) => {
        const payment = paymentByMonth.get(month);
        if (payment) {
            return {
                month,
                amount: payment.amount,
                amountPaid: payment.amountPaid,
                status: payment.status,
                feePaymentId: String(payment._id),
                selectable: payment.status !== "paid" && payment.amountPaid === 0
            };
        }
        const status = month < nowKey ? "overdue" : "pending";
        return {
            month,
            amount: transport.monthlyTransportFee,
            amountPaid: 0,
            status,
            feePaymentId: null,
            selectable: true
        };
    });
    const bus = transport.busId;
    res.json({
        success: true,
        data: {
            studentId: String(student._id),
            studentName: student.name,
            grade: student.grade,
            academicYear,
            monthlyFee: transport.monthlyTransportFee,
            busNumber: bus?.busNumber ?? null,
            routeName: bus?.routeName ?? null,
            months
        },
        message: "Transport advance months fetched successfully"
    });
}));
feesRouter.get("/payment-history", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaffAny)("canCollectFees", "canViewReports"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { studentId, academicYear } = req.query;
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 20);
    const orgF = (0, orgFilter_1.orgFilter)(authReq, res);
    const transportFilter = {
        ...orgF,
        amountPaid: { $gt: 0 }
    };
    const schoolFilter = { ...orgF };
    if (studentId && mongoose_1.Types.ObjectId.isValid(studentId)) {
        const studentObjectId = new mongoose_1.Types.ObjectId(studentId);
        transportFilter.studentId = studentObjectId;
        schoolFilter.studentId = studentObjectId;
    }
    if (academicYear) {
        transportFilter.academicYear = academicYear;
        schoolFilter.academicYear = academicYear;
    }
    const perSourceLimit = Math.min(page * limit, 500);
    const [transportRows, schoolRows, transportTotal, schoolTotal] = await Promise.all([
        FeePayment_1.FeePayment.find(transportFilter)
            .sort({ paidAt: -1, updatedAt: -1 })
            .limit(perSourceLimit)
            .populate("studentId", "name grade")
            .populate("busId", "busNumber")
            .lean(),
        SchoolFeePayment_1.SchoolFeePayment.find(schoolFilter)
            .sort({ paymentDate: -1 })
            .limit(perSourceLimit)
            .populate("studentId", "name grade")
            .lean(),
        FeePayment_1.FeePayment.countDocuments(transportFilter),
        SchoolFeePayment_1.SchoolFeePayment.countDocuments(schoolFilter)
    ]);
    const formatMonthLabel = (monthKey) => {
        const parsed = new Date(`${monthKey}-01`);
        if (Number.isNaN(parsed.getTime())) {
            return monthKey;
        }
        return parsed.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    };
    const transportEntries = transportRows.map((row) => {
        const student = row.studentId;
        const bus = row.busId;
        const paidAt = row.paidAt ?? row.updatedAt ?? new Date();
        const busLabel = bus?.busNumber ? ` · Bus ${bus.busNumber}` : "";
        return {
            sortKey: new Date(paidAt).getTime(),
            id: String(row._id),
            feeType: "transport",
            studentId: student?._id ? String(student._id) : String(row.studentId),
            studentName: student?.name ?? "—",
            grade: student?.grade ?? "—",
            receiptNumber: String(row._id).slice(-6).toUpperCase(),
            amountPaid: row.amountPaid,
            paymentMode: row.paymentMode ?? "cash",
            paidAt: new Date(paidAt).toISOString(),
            description: `Transport · ${formatMonthLabel(row.month)}${busLabel}`,
            transportPaymentId: String(row._id),
            schoolReceiptNumber: null
        };
    });
    const schoolEntries = schoolRows.map((row) => {
        const student = row.studentId;
        const heads = row.feeHeadPayments?.map((h) => h.feeHeadName).filter(Boolean) ?? [];
        const description = heads.length > 0 ? `School · ${heads.slice(0, 2).join(", ")}${heads.length > 2 ? "…" : ""}` : "School fees";
        return {
            sortKey: new Date(row.paymentDate).getTime(),
            id: String(row._id),
            feeType: "school",
            studentId: student?._id ? String(student._id) : String(row.studentId),
            studentName: student?.name ?? "—",
            grade: student?.grade ?? "—",
            receiptNumber: row.receiptNumber,
            amountPaid: row.totalAmountPaid,
            paymentMode: row.paymentMode,
            paidAt: new Date(row.paymentDate).toISOString(),
            description,
            transportPaymentId: null,
            schoolReceiptNumber: row.receiptNumber
        };
    });
    const merged = [...transportEntries, ...schoolEntries].sort((a, b) => b.sortKey - a.sortKey);
    const total = transportTotal + schoolTotal;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const data = merged.slice(start, start + limit).map(({ sortKey: _sortKey, ...entry }) => entry);
    res.json({
        success: true,
        data,
        pagination: {
            total,
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        },
        message: "Payment history fetched successfully"
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
        await (0, cache_1.invalidateOrgReportsCache)(orgId);
    }
    res.json({
        success: true,
        data: { createdCount, updatedCount, totalStudents },
        message: "Monthly fee generation completed"
    });
}));
const buildReceiptData = async (paymentId, orgScopeFilter) => {
    const payment = await FeePayment_1.FeePayment.findOne({ _id: paymentId, ...orgScopeFilter })
        .populate("studentId", "name grade")
        .populate("busId", "busNumber")
        .populate("transportId", "monthlyTransportFee")
        .populate("collectedBy", "name");
    if (!payment) {
        return null;
    }
    const student = payment.studentId;
    const bus = payment.busId;
    const transport = payment.transportId;
    const organizationId = String(payment.organizationId);
    const organization = await (0, orgThemeService_1.getOrgReceiptBranding)(organizationId);
    const collectedByLabel = organization?.displayName?.trim() || organization?.orgName || "School";
    const base = {
        studentName: student?.name,
        grade: student?.grade,
        busNumber: bus?.busNumber,
        month: payment.month,
        monthlyFee: transport?.monthlyTransportFee ?? payment.amount,
        amountPaid: payment.amountPaid,
        status: payment.status,
        paidAt: payment.paidAt,
        collectedBy: collectedByLabel,
        paymentMode: payment.paymentMode ?? "cash",
        receiptNumber: String(payment._id).slice(-6).toUpperCase(),
        paymentType: payment.paymentType ?? "single",
        isPartOfGroup: false
    };
    if (!payment.feeGroupId) {
        return { ...base, organization };
    }
    const group = await FeeGroup_1.FeeGroup.findById(payment.feeGroupId);
    const groupPayments = await FeePayment_1.FeePayment.find({ feeGroupId: payment.feeGroupId }).sort({
        month: 1
    });
    const groupedMonths = groupPayments.map((p) => ({
        month: p.month,
        status: p.status,
        amountPaid: p.amountPaid,
        amountDue: p.amount
    }));
    const totalAmountDue = groupedMonths.reduce((sum, row) => sum + row.amountDue, 0);
    const totalAmountPaid = groupedMonths.reduce((sum, row) => sum + row.amountPaid, 0);
    const allPaid = groupedMonths.every((row) => row.status === "paid");
    return {
        ...base,
        organization,
        isPartOfGroup: true,
        isAdvance: true,
        groupReceiptNumber: group?.receiptNumber ?? null,
        receiptNumber: group?.receiptNumber ?? base.receiptNumber,
        groupedMonths,
        month: groupedMonths.map((g) => g.month).join(", "),
        monthlyFee: totalAmountDue,
        amountPaid: totalAmountPaid,
        amountDue: totalAmountDue,
        status: allPaid ? "paid" : payment.status,
        paidAt: group?.collectedAt ?? payment.paidAt,
        paymentMode: payment.paymentMode ?? "cash"
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
