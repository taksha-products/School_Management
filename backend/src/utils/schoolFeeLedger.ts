import { Types } from "mongoose";

import { FeeLedger, type FeeLedgerStatus } from "../models/FeeLedger";
import type { IFeeHead, IFeeStructure } from "../models/FeeStructure";
import type { IConcession } from "../models/StudentFeeAssignment";
import { StudentFeeAssignment } from "../models/StudentFeeAssignment";

export type PeriodEntry = {
  periodLabel: string;
  displayLabel: string;
  dueDate: Date;
};

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

export const parseAcademicYearStart = (academicYear: string): number => {
  const [start] = academicYear.split("-");
  return Number(start);
};

/** Academic year months: April (startYear) through March (startYear + 1). */
export const getAcademicYearMonthKeys = (academicYear: string): string[] => {
  const startYear = parseAcademicYearStart(academicYear);
  const keys: string[] = [];
  for (let m = 4; m <= 12; m += 1) {
    keys.push(`${startYear}-${String(m).padStart(2, "0")}`);
  }
  for (let m = 1; m <= 3; m += 1) {
    keys.push(`${startYear + 1}-${String(m).padStart(2, "0")}`);
  }
  return keys;
};

const buildDueDate = (year: number, month: number, dueDay: number): Date => {
  const day = Math.min(dueDay, 28);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

export const formatMonthDisplay = (periodKey: string): string => {
  const [year, month] = periodKey.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
};

export const generatePeriodsForFeeHead = (
  feeHead: IFeeHead,
  academicYear: string
): PeriodEntry[] => {
  const startYear = parseAcademicYearStart(academicYear);
  const dueDay = feeHead.dueDay || 10;

  if (feeHead.frequency === "monthly") {
    return getAcademicYearMonthKeys(academicYear).map((periodLabel) => {
      const [y, m] = periodLabel.split("-").map(Number);
      return {
        periodLabel,
        displayLabel: formatMonthDisplay(periodLabel),
        dueDate: buildDueDate(y, m, dueDay)
      };
    });
  }

  if (feeHead.frequency === "quarterly") {
    const quarters: PeriodEntry[] = [
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

export const applyConcession = (
  baseAmount: number,
  feeHeadName: string,
  concessions: IConcession[]
): number => {
  const concession = concessions.find((c) => c.feeHeadName === feeHeadName);
  if (!concession) {
    return baseAmount;
  }
  if (concession.concessionType === "percentage") {
    return Math.round(baseAmount * (1 - concession.concessionValue / 100));
  }
  return Math.max(0, baseAmount - concession.concessionValue);
};

export const computeLedgerStatus = (
  amountDue: number,
  amountPaid: number,
  dueDate?: Date,
  lateFee = 0
): FeeLedgerStatus => {
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

export const generateReceiptNumber = (): string => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RCP-${ts}-${rand}`;
};

export const refreshOverdueStatuses = async (
  filter: Record<string, unknown>
): Promise<void> => {
  const now = new Date();
  await FeeLedger.updateMany(
    {
      ...filter,
      status: { $in: ["pending", "partial"] },
      dueDate: { $lt: now },
      $expr: { $lt: ["$amountPaid", "$amountDue"] }
    },
    { $set: { status: "overdue" } }
  );
};

const ledgerEntryKey = (
  studentId: Types.ObjectId,
  feeHeadName: string,
  periodLabel: string
): string => `${studentId.toString()}|${feeHeadName}|${periodLabel}`;

const LEDGER_INSERT_BATCH_SIZE = 500;

const countBulkInsertResults = (error: unknown, chunkSize: number): number => {
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "MongoBulkWriteError" &&
    "result" in error &&
    error.result &&
    typeof error.result === "object" &&
    "nInserted" in error.result &&
    typeof error.result.nInserted === "number"
  ) {
    return error.result.nInserted;
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000
  ) {
    return 0;
  }

  throw error;
};

const insertLedgerEntries = async (
  entries: Array<{
    organizationId: Types.ObjectId;
    studentId: Types.ObjectId;
    feeStructureId: Types.ObjectId;
    feeHeadName: string;
    periodLabel: string;
    amountDue: number;
    amountPaid: number;
    lateFee: number;
    status: FeeLedgerStatus;
    dueDate: Date;
    academicYear: string;
  }>
): Promise<number> => {
  if (entries.length === 0) {
    return 0;
  }

  let inserted = 0;

  for (let index = 0; index < entries.length; index += LEDGER_INSERT_BATCH_SIZE) {
    const chunk = entries.slice(index, index + LEDGER_INSERT_BATCH_SIZE);

    try {
      const created = await FeeLedger.insertMany(chunk, { ordered: false });
      inserted += created.length;
    } catch (error) {
      inserted += countBulkInsertResults(error, chunk.length);
    }
  }

  return inserted;
};

const buildLedgerEntriesForStudent = (
  organizationId: Types.ObjectId,
  studentId: Types.ObjectId,
  feeStructure: IFeeStructure,
  academicYear: string,
  concessions: IConcession[],
  existingKeys: Set<string>
): Array<{
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  feeStructureId: Types.ObjectId;
  feeHeadName: string;
  periodLabel: string;
  amountDue: number;
  amountPaid: number;
  lateFee: number;
  status: FeeLedgerStatus;
  dueDate: Date;
  academicYear: string;
}> => {
  const entries: Array<{
    organizationId: Types.ObjectId;
    studentId: Types.ObjectId;
    feeStructureId: Types.ObjectId;
    feeHeadName: string;
    periodLabel: string;
    amountDue: number;
    amountPaid: number;
    lateFee: number;
    status: FeeLedgerStatus;
    dueDate: Date;
    academicYear: string;
  }> = [];

  for (const feeHead of feeStructure.feeHeads ?? []) {
    const periods = generatePeriodsForFeeHead(feeHead, academicYear);
    const amountDue = applyConcession(feeHead.amount, feeHead.name, concessions);

    for (const period of periods) {
      const key = ledgerEntryKey(studentId, feeHead.name, period.periodLabel);
      if (existingKeys.has(key)) {
        continue;
      }

      const status = computeLedgerStatus(amountDue, 0, period.dueDate);
      entries.push({
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
      existingKeys.add(key);
    }
  }

  return entries;
};

export const generateLedgerForAssignment = async (
  organizationId: Types.ObjectId,
  studentId: Types.ObjectId,
  feeStructure: IFeeStructure,
  academicYear: string,
  concessions: IConcession[] = []
): Promise<number> => {
  const existingLedgers = await FeeLedger.find({
    organizationId,
    studentId
  })
    .select("feeHeadName periodLabel")
    .lean();

  const existingKeys = new Set(
    existingLedgers.map((row) => ledgerEntryKey(studentId, row.feeHeadName, row.periodLabel))
  );

  const entries = buildLedgerEntriesForStudent(
    organizationId,
    studentId,
    feeStructure,
    academicYear,
    concessions,
    existingKeys
  );

  return insertLedgerEntries(entries);
};

export const assignFeeStructureToStudents = async (
  organizationId: Types.ObjectId,
  feeStructure: IFeeStructure,
  studentIds: Types.ObjectId[],
  academicYear: string
): Promise<{ assignments: number; ledgerEntries: number; skipped: string[] }> => {
  if (studentIds.length === 0) {
    return { assignments: 0, ledgerEntries: 0, skipped: [] };
  }

  await StudentFeeAssignment.bulkWrite(
    studentIds.map((studentId) => ({
      updateOne: {
        filter: { organizationId, studentId, academicYear },
        update: {
          $set: {
            organizationId,
            studentId,
            feeStructureId: feeStructure._id,
            academicYear,
            isActive: true
          },
          $setOnInsert: { concessions: [] }
        },
        upsert: true
      }
    }))
  );

  const assignments = await StudentFeeAssignment.find({
    organizationId,
    studentId: { $in: studentIds },
    academicYear
  }).lean();

  const concessionsByStudent = new Map(
    assignments.map((assignment) => [
      assignment.studentId.toString(),
      assignment.concessions ?? []
    ])
  );

  const existingLedgers = await FeeLedger.find({
    organizationId,
    studentId: { $in: studentIds }
  })
    .select("studentId feeHeadName periodLabel")
    .lean();

  const existingKeys = new Set(
    existingLedgers.map((row) =>
      ledgerEntryKey(row.studentId as Types.ObjectId, row.feeHeadName, row.periodLabel)
    )
  );

  const toInsert: Array<{
    organizationId: Types.ObjectId;
    studentId: Types.ObjectId;
    feeStructureId: Types.ObjectId;
    feeHeadName: string;
    periodLabel: string;
    amountDue: number;
    amountPaid: number;
    lateFee: number;
    status: FeeLedgerStatus;
    dueDate: Date;
    academicYear: string;
  }> = [];

  const skipped: string[] = [];

  for (const studentId of studentIds) {
    const concessions = concessionsByStudent.get(studentId.toString()) ?? [];
    const beforeCount = toInsert.length;

    toInsert.push(
      ...buildLedgerEntriesForStudent(
        organizationId,
        studentId,
        feeStructure,
        academicYear,
        concessions,
        existingKeys
      )
    );

    if (toInsert.length === beforeCount) {
      skipped.push(studentId.toString());
    }
  }

  const ledgerEntries = await insertLedgerEntries(toInsert);

  return {
    assignments: studentIds.length,
    ledgerEntries,
    skipped
  };
};

export const periodMatchesMonth = (periodLabel: string, monthKey: string): boolean => {
  if (periodLabel === monthKey) {
    return true;
  }
  if (periodLabel.startsWith("Q")) {
    const qMap: Record<string, string[]> = {
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
