import { Types } from "mongoose";

import { FeeLedger } from "../models/FeeLedger";
import { SchoolFeePayment, type IFeeHeadPayment } from "../models/SchoolFeePayment";
import { computeLedgerStatus, generateReceiptNumber } from "../utils/schoolFeeLedger";

export interface SchoolPaymentLineInput {
  feeHeadName: string;
  periodLabel: string;
  amountPaid: number;
  lateFee?: number;
}

export type SchoolPaymentLineBody = {
  feeHeadName: string;
  periodLabel: string;
  amountPaid: number | string;
  lateFee?: number | string;
};

const toPaise = (amount: number): number => Math.round(amount * 100);

const getOutstandingBalance = (
  amountDue: number,
  amountPaid: number,
  lateFee: number
): number => Math.max(0, amountDue + lateFee - amountPaid);

const resolveLinePaymentStatus = (
  amountDue: number,
  ledgerAmountPaid: number,
  payAmount: number
): "paid" | "partial" => {
  const feeBalancePaise = toPaise(Math.max(0, amountDue - ledgerAmountPaid));
  return toPaise(payAmount) >= feeBalancePaise ? "paid" : "partial";
};

const validatePaymentLineAmounts = (
  payAmount: number,
  balance: number,
  feeHeadName: string,
  periodLabel: string
): void => {
  if (toPaise(payAmount) > toPaise(balance)) {
    throw new Error(`Amount exceeds balance for ${feeHeadName} / ${periodLabel}`);
  }
};

const parseNonNegativeAmount = (value: unknown, fieldLabel: string): number => {
  let numeric: number;

  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error(`Invalid ${fieldLabel}: must be a number`);
    }
    numeric = Number(trimmed);
  } else {
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
export const parseSchoolPaymentLines = (
  payments: SchoolPaymentLineBody[]
): SchoolPaymentLineInput[] =>
  payments.map((line, index) => ({
    feeHeadName: line.feeHeadName,
    periodLabel: line.periodLabel,
    amountPaid: parseNonNegativeAmount(line.amountPaid, `payments[${index}].amountPaid`),
    lateFee: 0
  }));

export interface BuiltSchoolPaymentLines {
  feeHeadPayments: IFeeHeadPayment[];
  totalAmountDue: number;
  totalAmountPaid: number;
  totalLateFee: number;
  ledgerIds: Types.ObjectId[];
}

/**
 * Validates payment lines against ledger balances and builds fee-head payment rows.
 */
export const buildSchoolPaymentLines = async (
  organizationId: string,
  studentId: string,
  academicYear: string,
  payments: SchoolPaymentLineInput[]
): Promise<BuiltSchoolPaymentLines> => {
  const feeHeadPayments: IFeeHeadPayment[] = [];
  let totalAmountDue = 0;
  let totalAmountPaid = 0;
  const ledgerIds: Types.ObjectId[] = [];

  for (const item of payments) {
    const ledger = await FeeLedger.findOne({
      organizationId: new Types.ObjectId(organizationId),
      studentId: new Types.ObjectId(studentId),
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

/**
 * Applies collected amounts to fee ledger entries after payment is confirmed.
 */
export const applySchoolPaymentLinesToLedger = async (
  organizationId: string,
  studentId: string,
  academicYear: string,
  payments: SchoolPaymentLineInput[],
  paymentId?: Types.ObjectId
): Promise<void> => {
  for (const item of payments) {
    const ledger = await FeeLedger.findOne({
      organizationId: new Types.ObjectId(organizationId),
      studentId: new Types.ObjectId(studentId),
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
    ledger.status = computeLedgerStatus(
      ledger.amountDue,
      newPaid,
      ledger.dueDate,
      ledger.lateFee
    );
    if (paymentId) {
      ledger.paymentId = paymentId;
    }
    await ledger.save();
  }
};

export interface SchoolPaymentIntentResult {
  feePaymentId: string;
  amount: number;
  description: string;
  receiptNumber: string;
}

/**
 * Creates a pending school fee payment record without updating ledgers.
 */
export const createSchoolPaymentIntent = async (params: {
  organizationId: string;
  studentId: string;
  academicYear: string;
  payments: SchoolPaymentLineBody[];
  createdBy: string;
  notes?: string;
}): Promise<SchoolPaymentIntentResult> => {
  const normalizedPayments = parseSchoolPaymentLines(params.payments);
  const built = await buildSchoolPaymentLines(
    params.organizationId,
    params.studentId,
    params.academicYear,
    normalizedPayments
  );

  let receiptNumber = generateReceiptNumber();
  let attempts = 0;
  while (await SchoolFeePayment.exists({ receiptNumber }) && attempts < 5) {
    receiptNumber = generateReceiptNumber();
    attempts += 1;
  }

  const description = built.feeHeadPayments
    .map((line) => `${line.feeHeadName} (${line.periodLabel})`)
    .join(", ");

  const payment = await SchoolFeePayment.create({
    organizationId: new Types.ObjectId(params.organizationId),
    studentId: new Types.ObjectId(params.studentId),
    receiptNumber,
    academicYear: params.academicYear,
    paymentDate: new Date(),
    paymentMode: "online",
    paymentStatus: "pending",
    collectedBy: new Types.ObjectId(params.createdBy),
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
