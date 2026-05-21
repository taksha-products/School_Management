"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.periodMatchesMonth = exports.assignFeeStructureToStudents = exports.generateLedgerForAssignment = exports.refreshOverdueStatuses = exports.generateReceiptNumber = exports.computeLedgerStatus = exports.applyConcession = exports.generatePeriodsForFeeHead = exports.formatMonthDisplay = exports.getAcademicYearMonthKeys = exports.parseAcademicYearStart = void 0;
const FeeLedger_1 = require("../models/FeeLedger");
const StudentFeeAssignment_1 = require("../models/StudentFeeAssignment");
const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];
const parseAcademicYearStart = (academicYear) => {
    const [start] = academicYear.split("-");
    return Number(start);
};
exports.parseAcademicYearStart = parseAcademicYearStart;
/** Academic year months: April (startYear) through March (startYear + 1). */
const getAcademicYearMonthKeys = (academicYear) => {
    const startYear = (0, exports.parseAcademicYearStart)(academicYear);
    const keys = [];
    for (let m = 4; m <= 12; m += 1) {
        keys.push(`${startYear}-${String(m).padStart(2, "0")}`);
    }
    for (let m = 1; m <= 3; m += 1) {
        keys.push(`${startYear + 1}-${String(m).padStart(2, "0")}`);
    }
    return keys;
};
exports.getAcademicYearMonthKeys = getAcademicYearMonthKeys;
const buildDueDate = (year, month, dueDay) => {
    const day = Math.min(dueDay, 28);
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};
const formatMonthDisplay = (periodKey) => {
    const [year, month] = periodKey.split("-").map(Number);
    return `${MONTH_NAMES[month - 1]} ${year}`;
};
exports.formatMonthDisplay = formatMonthDisplay;
const generatePeriodsForFeeHead = (feeHead, academicYear) => {
    const startYear = (0, exports.parseAcademicYearStart)(academicYear);
    const dueDay = feeHead.dueDay || 10;
    if (feeHead.frequency === "monthly") {
        return (0, exports.getAcademicYearMonthKeys)(academicYear).map((periodLabel) => {
            const [y, m] = periodLabel.split("-").map(Number);
            return {
                periodLabel,
                displayLabel: (0, exports.formatMonthDisplay)(periodLabel),
                dueDate: buildDueDate(y, m, dueDay)
            };
        });
    }
    if (feeHead.frequency === "quarterly") {
        const quarters = [
            {
                periodLabel: `Q1-${academicYear}`,
                displayLabel: `Q1 ${academicYear}`,
                dueDate: buildDueDate(startYear, 4, dueDay)
            },
            {
                periodLabel: `Q2-${academicYear}`,
                displayLabel: `Q2 ${academicYear}`,
                dueDate: buildDueDate(startYear, 7, dueDay)
            },
            {
                periodLabel: `Q3-${academicYear}`,
                displayLabel: `Q3 ${academicYear}`,
                dueDate: buildDueDate(startYear, 10, dueDay)
            },
            {
                periodLabel: `Q4-${academicYear}`,
                displayLabel: `Q4 ${academicYear}`,
                dueDate: buildDueDate(startYear + 1, 1, dueDay)
            }
        ];
        return quarters;
    }
    if (feeHead.frequency === "annual") {
        const periodLabel = `Annual-${academicYear}`;
        return [
            {
                periodLabel,
                displayLabel: `Annual ${academicYear}`,
                dueDate: buildDueDate(startYear, 4, dueDay)
            }
        ];
    }
    const periodLabel = `OneTime-${academicYear}`;
    return [
        {
            periodLabel,
            displayLabel: "One Time",
            dueDate: buildDueDate(startYear, 4, dueDay)
        }
    ];
};
exports.generatePeriodsForFeeHead = generatePeriodsForFeeHead;
const applyConcession = (baseAmount, feeHeadName, concessions) => {
    const concession = concessions.find((c) => c.feeHeadName === feeHeadName);
    if (!concession) {
        return baseAmount;
    }
    if (concession.concessionType === "percentage") {
        return Math.round(baseAmount * (1 - concession.concessionValue / 100));
    }
    return Math.max(0, baseAmount - concession.concessionValue);
};
exports.applyConcession = applyConcession;
const computeLedgerStatus = (amountDue, amountPaid, dueDate, lateFee = 0) => {
    const totalOwed = amountDue + lateFee;
    if (amountPaid >= totalOwed) {
        return "paid";
    }
    if (amountPaid > 0) {
        return "partial";
    }
    if (dueDate && dueDate < new Date()) {
        return "overdue";
    }
    return "pending";
};
exports.computeLedgerStatus = computeLedgerStatus;
const generateReceiptNumber = () => {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `RCP-${ts}-${rand}`;
};
exports.generateReceiptNumber = generateReceiptNumber;
const refreshOverdueStatuses = async (filter) => {
    const now = new Date();
    await FeeLedger_1.FeeLedger.updateMany({
        ...filter,
        status: { $in: ["pending", "partial"] },
        dueDate: { $lt: now },
        $expr: { $lt: ["$amountPaid", "$amountDue"] }
    }, { $set: { status: "overdue" } });
};
exports.refreshOverdueStatuses = refreshOverdueStatuses;
const generateLedgerForAssignment = async (organizationId, studentId, feeStructure, academicYear, concessions) => {
    let created = 0;
    for (const feeHead of feeStructure.feeHeads) {
        const periods = (0, exports.generatePeriodsForFeeHead)(feeHead, academicYear);
        const amountDue = (0, exports.applyConcession)(feeHead.amount, feeHead.name, concessions);
        for (const period of periods) {
            const existing = await FeeLedger_1.FeeLedger.findOne({
                studentId,
                feeHeadName: feeHead.name,
                periodLabel: period.periodLabel,
                academicYear
            });
            if (existing) {
                continue;
            }
            const status = (0, exports.computeLedgerStatus)(0, 0, period.dueDate);
            await FeeLedger_1.FeeLedger.create({
                organizationId,
                studentId,
                feeStructureId: feeStructure._id,
                feeHeadName: feeHead.name,
                periodLabel: period.periodLabel,
                amountDue,
                amountPaid: 0,
                lateFee: 0,
                status: amountDue === 0 ? "paid" : status,
                dueDate: period.dueDate,
                academicYear
            });
            created += 1;
        }
    }
    return created;
};
exports.generateLedgerForAssignment = generateLedgerForAssignment;
const assignFeeStructureToStudents = async (organizationId, feeStructure, studentIds, academicYear) => {
    const skipped = [];
    let assignments = 0;
    let ledgerEntries = 0;
    for (const studentId of studentIds) {
        const assignment = await StudentFeeAssignment_1.StudentFeeAssignment.findOneAndUpdate({
            organizationId,
            studentId,
            academicYear
        }, {
            $set: {
                organizationId,
                studentId,
                feeStructureId: feeStructure._id,
                academicYear,
                isActive: true
            },
            $setOnInsert: { concessions: [] }
        }, { upsert: true, new: true });
        assignments += 1;
        const created = await (0, exports.generateLedgerForAssignment)(organizationId, studentId, feeStructure, academicYear, assignment.concessions);
        ledgerEntries += created;
        if (created === 0) {
            skipped.push(studentId.toString());
        }
    }
    return { assignments, ledgerEntries, skipped };
};
exports.assignFeeStructureToStudents = assignFeeStructureToStudents;
const periodMatchesMonth = (periodLabel, monthKey) => {
    if (periodLabel === monthKey) {
        return true;
    }
    if (periodLabel.startsWith("Q")) {
        const qMap = {
            Q1: ["04", "05", "06"],
            Q2: ["07", "08", "09"],
            Q3: ["10", "11", "12"],
            Q4: ["01", "02", "03"]
        };
        const [, month] = monthKey.split("-");
        const q = periodLabel.slice(0, 2);
        return qMap[q]?.includes(month) ?? false;
    }
    if (periodLabel.startsWith("Annual") || periodLabel.startsWith("OneTime")) {
        const [, month] = monthKey.split("-");
        return month === "04";
    }
    return false;
};
exports.periodMatchesMonth = periodMatchesMonth;
