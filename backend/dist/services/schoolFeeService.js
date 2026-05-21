"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrgFeeSummary = exports.buildReceiptView = exports.buildStudentFeeLedgerView = void 0;
const mongoose_1 = require("mongoose");
const FeeLedger_1 = require("../models/FeeLedger");
const SchoolFeePayment_1 = require("../models/SchoolFeePayment");
const Student_1 = require("../models/Student");
const StudentFeeAssignment_1 = require("../models/StudentFeeAssignment");
const schoolFeeLedger_1 = require("../utils/schoolFeeLedger");
const buildStudentFeeLedgerView = async (organizationId, studentId, academicYear) => {
    const orgObjectId = new mongoose_1.Types.ObjectId(organizationId);
    const studentObjectId = new mongoose_1.Types.ObjectId(studentId);
    await (0, schoolFeeLedger_1.refreshOverdueStatuses)({
        organizationId: orgObjectId,
        studentId: studentObjectId,
        academicYear
    });
    const student = await Student_1.Student.findOne({
        _id: studentObjectId,
        organizationId: orgObjectId
    }).populate("busId", "busNumber routeName");
    if (!student) {
        return null;
    }
    const assignment = await StudentFeeAssignment_1.StudentFeeAssignment.findOne({
        organizationId: orgObjectId,
        studentId: studentObjectId,
        academicYear,
        isActive: true
    }).populate("feeStructureId", "name feeHeads");
    const ledgerEntries = await FeeLedger_1.FeeLedger.find({
        organizationId: orgObjectId,
        studentId: studentObjectId,
        academicYear
    }).sort({ feeHeadName: 1, periodLabel: 1 });
    const payments = await SchoolFeePayment_1.SchoolFeePayment.find({
        organizationId: orgObjectId,
        studentId: studentObjectId,
        academicYear
    })
        .populate("collectedBy", "name")
        .sort({ paymentDate: -1 });
    const byFeeHead = new Map();
    for (const entry of ledgerEntries) {
        if (!byFeeHead.has(entry.feeHeadName)) {
            byFeeHead.set(entry.feeHeadName, {
                feeHeadName: entry.feeHeadName,
                periods: [],
                totalDue: 0,
                totalPaid: 0,
                balance: 0
            });
        }
        const group = byFeeHead.get(entry.feeHeadName);
        const balance = Math.max(0, entry.amountDue + entry.lateFee - entry.amountPaid);
        const displayLabel = entry.periodLabel.match(/^\d{4}-\d{2}$/)
            ? (0, schoolFeeLedger_1.formatMonthDisplay)(entry.periodLabel)
            : entry.periodLabel.replace(/-/g, " ");
        group.periods.push({
            periodLabel: entry.periodLabel,
            displayLabel,
            amountDue: entry.amountDue,
            amountPaid: entry.amountPaid,
            lateFee: entry.lateFee,
            balance,
            status: entry.status,
            dueDate: entry.dueDate
        });
        group.totalDue += entry.amountDue;
        group.totalPaid += entry.amountPaid;
        group.balance += balance;
    }
    const totalDue = ledgerEntries.reduce((s, e) => s + e.amountDue, 0);
    const totalPaid = ledgerEntries.reduce((s, e) => s + e.amountPaid, 0);
    const totalLateFee = ledgerEntries.reduce((s, e) => s + e.lateFee, 0);
    const outstandingBalance = ledgerEntries.reduce((s, e) => s + Math.max(0, e.amountDue + e.lateFee - e.amountPaid), 0);
    const overdueAmount = ledgerEntries
        .filter((e) => e.status === "overdue")
        .reduce((s, e) => s + Math.max(0, e.amountDue + e.lateFee - e.amountPaid), 0);
    const upcomingDues = ledgerEntries
        .filter((e) => ["pending", "partial"].includes(e.status) && e.dueDate && e.dueDate >= new Date())
        .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
        .slice(0, 5)
        .map((e) => ({
        feeHeadName: e.feeHeadName,
        periodLabel: e.periodLabel,
        amountDue: e.amountDue,
        dueDate: e.dueDate,
        balance: Math.max(0, e.amountDue + e.lateFee - e.amountPaid)
    }));
    return {
        student: {
            _id: student._id,
            name: student.name,
            grade: student.grade,
            parentName: student.parentName,
            parentPhone: student.parentPhone,
            bus: student.busId
        },
        assignment,
        feeHeads: Array.from(byFeeHead.values()),
        summary: {
            totalDue,
            totalPaid,
            totalLateFee,
            outstandingBalance,
            overdueAmount
        },
        upcomingDues,
        paymentHistory: payments
    };
};
exports.buildStudentFeeLedgerView = buildStudentFeeLedgerView;
const buildReceiptView = async (organizationId, receiptNumber) => {
    const payment = await SchoolFeePayment_1.SchoolFeePayment.findOne({
        organizationId: new mongoose_1.Types.ObjectId(organizationId),
        receiptNumber
    })
        .populate("studentId", "name grade parentName")
        .populate("collectedBy", "name");
    if (!payment) {
        return null;
    }
    const student = payment.studentId;
    const collector = payment.collectedBy;
    return {
        receiptNumber: payment.receiptNumber,
        paymentDate: payment.paymentDate,
        paymentMode: payment.paymentMode,
        upiTransactionId: payment.upiTransactionId,
        studentName: student?.name,
        grade: student?.grade,
        parentName: student?.parentName,
        feeHeadPayments: payment.feeHeadPayments,
        totalAmountDue: payment.totalAmountDue,
        totalAmountPaid: payment.totalAmountPaid,
        totalLateFee: payment.totalLateFee,
        collectedBy: collector?.name,
        notes: payment.notes
    };
};
exports.buildReceiptView = buildReceiptView;
const buildOrgFeeSummary = async (organizationId, academicYear, month) => {
    const orgObjectId = new mongoose_1.Types.ObjectId(organizationId);
    const ledgerFilter = {
        organizationId: orgObjectId,
        academicYear
    };
    let ledgerEntries = await FeeLedger_1.FeeLedger.find(ledgerFilter).populate("studentId", "grade");
    if (month) {
        ledgerEntries = ledgerEntries.filter((e) => (0, schoolFeeLedger_1.periodMatchesMonth)(e.periodLabel, month));
    }
    const paymentFilter = {
        organizationId: orgObjectId,
        academicYear
    };
    let payments = await SchoolFeePayment_1.SchoolFeePayment.find(paymentFilter);
    if (month) {
        const start = new Date(`${month}-01T00:00:00.000Z`);
        const end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + 1);
        payments = payments.filter((p) => p.paymentDate >= start && p.paymentDate < end);
    }
    const totalDue = ledgerEntries.reduce((s, e) => s + e.amountDue, 0);
    const totalCollectedFromLedger = ledgerEntries.reduce((s, e) => s + e.amountPaid, 0);
    const totalCollectedFromPayments = payments.reduce((s, p) => s + p.totalAmountPaid, 0);
    const totalCollected = month ? totalCollectedFromPayments : totalCollectedFromLedger;
    const totalOutstanding = ledgerEntries.reduce((s, e) => s + Math.max(0, e.amountDue + e.lateFee - e.amountPaid), 0);
    const byGradeMap = new Map();
    const byFeeHeadMap = new Map();
    for (const entry of ledgerEntries) {
        const student = entry.studentId;
        const grade = student?.grade ?? "Unknown";
        if (!byGradeMap.has(grade)) {
            byGradeMap.set(grade, { due: 0, collected: 0, outstanding: 0 });
        }
        const g = byGradeMap.get(grade);
        g.due += entry.amountDue;
        g.collected += entry.amountPaid;
        g.outstanding += Math.max(0, entry.amountDue + entry.lateFee - entry.amountPaid);
        if (!byFeeHeadMap.has(entry.feeHeadName)) {
            byFeeHeadMap.set(entry.feeHeadName, { due: 0, collected: 0, outstanding: 0 });
        }
        const f = byFeeHeadMap.get(entry.feeHeadName);
        f.due += entry.amountDue;
        f.collected += entry.amountPaid;
        f.outstanding += Math.max(0, entry.amountDue + entry.lateFee - entry.amountPaid);
    }
    const collectionRate = totalDue > 0 ? Math.round((totalCollected / totalDue) * 10000) / 100 : 0;
    return {
        totalDue,
        totalCollected,
        totalOutstanding,
        byGrade: Array.from(byGradeMap.entries()).map(([grade, v]) => ({ grade, ...v })),
        byFeeHead: Array.from(byFeeHeadMap.entries()).map(([feeHeadName, v]) => ({
            feeHeadName,
            ...v
        })),
        collectionRate
    };
};
exports.buildOrgFeeSummary = buildOrgFeeSummary;
