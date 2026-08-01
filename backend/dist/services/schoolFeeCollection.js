"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSchoolPaymentIntent = exports.applySchoolPaymentLinesToLedger = exports.buildSchoolPaymentLines = exports.parseSchoolPaymentLines = void 0;
const mongoose_1 = require("mongoose");
const FeeLedger_1 = require("../models/FeeLedger");
const SchoolFeePayment_1 = require("../models/SchoolFeePayment");
const schoolFeeLedger_1 = require("../utils/schoolFeeLedger");
const toPaise = (amount) => Math.round(amount * 100);
const getOutstandingBalance = (amountDue, amountPaid, lateFee) => Math.max(0, amountDue + lateFee - amountPaid);
const resolveLinePaymentStatus = (amountDue, ledgerAmountPaid, payAmount) => {
    const feeBalancePaise = toPaise(Math.max(0, amountDue - ledgerAmountPaid));
    return toPaise(payAmount) >= feeBalancePaise ? "paid" : "partial";
};
const validatePaymentLineAmounts = (payAmount, balance, feeHeadName, periodLabel) => {
    if (toPaise(payAmount) > toPaise(balance)) {
        throw new Error(`Amount exceeds balance for ${feeHeadName} / ${periodLabel}`);
    }
};
const parseNonNegativeAmount = (value, fieldLabel) => {
    let numeric;
    if (typeof value === "number") {
        numeric = value;
    }
    else if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
            throw new Error(`Invalid ${fieldLabel}: must be a number`);
        }
        numeric = Number(trimmed);
    }
    else {
        throw new Error(`Invalid ${fieldLabel}: must be a number`);
    }
    if (!Number.isFinite(numeric) || numeric < 0) {
        throw new Error(`Invalid ${fieldLabel}: must be a non-negative number`);
    }
    return numeric;
};
/**
 * Coerces request-body payment lines to numeric amounts before validation.
 */
const parseSchoolPaymentLines = (payments) => payments.map((line, index) => ({
    feeHeadName: line.feeHeadName,
    periodLabel: line.periodLabel,
    amountPaid: parseNonNegativeAmount(line.amountPaid, `payments[${index}].amountPaid`),
    lateFee: 0
}));
exports.parseSchoolPaymentLines = parseSchoolPaymentLines;
/**
 * Validates payment lines against ledger balances and builds fee-head payment rows.
 */
const buildSchoolPaymentLines = async (organizationId, studentId, academicYear, payments) => {
    const feeHeadPayments = [];
    let totalAmountDue = 0;
    let totalAmountPaid = 0;
    const ledgerIds = [];
    for (const item of payments) {
        const ledger = await FeeLedger_1.FeeLedger.findOne({
            organizationId: new mongoose_1.Types.ObjectId(organizationId),
            studentId: new mongoose_1.Types.ObjectId(studentId),
            academicYear,
            feeHeadName: item.feeHeadName,
            periodLabel: item.periodLabel
        });
        if (!ledger) {
            throw new Error(`No ledger entry for ${item.feeHeadName} / ${item.periodLabel}`);
        }
        const payAmount = item.amountPaid;
        const balance = getOutstandingBalance(ledger.amountDue, ledger.amountPaid, ledger.lateFee);
        validatePaymentLineAmounts(payAmount, balance, item.feeHeadName, item.periodLabel);
        const lineStatus = resolveLinePaymentStatus(ledger.amountDue, ledger.amountPaid, payAmount);
        feeHeadPayments.push({
            feeHeadName: item.feeHeadName,
            periodLabel: item.periodLabel,
            amountDue: ledger.amountDue,
            amountPaid: payAmount,
            lateFee: 0,
            status: lineStatus
        });
        totalAmountDue += ledger.amountDue;
        totalAmountPaid += payAmount;
        ledgerIds.push(ledger._id);
    }
    return { feeHeadPayments, totalAmountDue, totalAmountPaid, totalLateFee: 0, ledgerIds };
};
exports.buildSchoolPaymentLines = buildSchoolPaymentLines;
/**
 * Applies collected amounts to fee ledger entries after payment is confirmed.
 */
const applySchoolPaymentLinesToLedger = async (organizationId, studentId, academicYear, payments, paymentId) => {
    for (const item of payments) {
        const ledger = await FeeLedger_1.FeeLedger.findOne({
            organizationId: new mongoose_1.Types.ObjectId(organizationId),
            studentId: new mongoose_1.Types.ObjectId(studentId),
            academicYear,
            feeHeadName: item.feeHeadName,
            periodLabel: item.periodLabel
        });
        if (!ledger) {
            continue;
        }
        const payAmount = item.amountPaid;
        const newPaid = ledger.amountPaid + payAmount;
        ledger.amountPaid = newPaid;
        ledger.status = (0, schoolFeeLedger_1.computeLedgerStatus)(ledger.amountDue, newPaid, ledger.dueDate, ledger.lateFee);
        if (paymentId) {
            ledger.paymentId = paymentId;
        }
        await ledger.save();
    }
};
exports.applySchoolPaymentLinesToLedger = applySchoolPaymentLinesToLedger;
/**
 * Creates a pending school fee payment record without updating ledgers.
 */
const createSchoolPaymentIntent = async (params) => {
    const normalizedPayments = (0, exports.parseSchoolPaymentLines)(params.payments);
    const built = await (0, exports.buildSchoolPaymentLines)(params.organizationId, params.studentId, params.academicYear, normalizedPayments);
    let receiptNumber = (0, schoolFeeLedger_1.generateReceiptNumber)();
    let attempts = 0;
    while (await SchoolFeePayment_1.SchoolFeePayment.exists({ receiptNumber }) && attempts < 5) {
        receiptNumber = (0, schoolFeeLedger_1.generateReceiptNumber)();
        attempts += 1;
    }
    const description = built.feeHeadPayments
        .map((line) => `${line.feeHeadName} (${line.periodLabel})`)
        .join(", ");
    const payment = await SchoolFeePayment_1.SchoolFeePayment.create({
        organizationId: new mongoose_1.Types.ObjectId(params.organizationId),
        studentId: new mongoose_1.Types.ObjectId(params.studentId),
        receiptNumber,
        academicYear: params.academicYear,
        paymentDate: new Date(),
        paymentMode: "online",
        paymentStatus: "pending",
        collectedBy: new mongoose_1.Types.ObjectId(params.createdBy),
        feeHeadPayments: built.feeHeadPayments,
        totalAmountDue: built.totalAmountDue,
        totalAmountPaid: built.totalAmountPaid,
        totalLateFee: 0,
        notes: params.notes
    });
    return {
        feePaymentId: payment._id.toString(),
        amount: built.totalAmountPaid,
        description,
        receiptNumber
    };
};
exports.createSchoolPaymentIntent = createSchoolPaymentIntent;
