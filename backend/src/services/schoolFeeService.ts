import { Types } from "mongoose";

import { FeeLedger } from "../models/FeeLedger";
import { SchoolFeePayment } from "../models/SchoolFeePayment";
import { Student } from "../models/Student";
import { StudentTransport } from "../models/StudentTransport";
import { StudentFeeAssignment } from "../models/StudentFeeAssignment";
import {
  formatMonthDisplay,
  periodMatchesMonth,
  refreshOverdueStatuses
} from "../utils/schoolFeeLedger";

export interface StudentFeeStatusEntry {
  balance: number;
  assigned: boolean;
}

export type StudentFeeStatusMap = Record<string, StudentFeeStatusEntry>;

export const buildStudentFeeStatusMap = async (
  organizationId: string,
  academicYear: string
): Promise<StudentFeeStatusMap> => {
  const organizationObjectId = new Types.ObjectId(organizationId);

  await refreshOverdueStatuses({
    organizationId: organizationObjectId,
    academicYear
  });

  const [assignments, balanceRows] = await Promise.all([
    StudentFeeAssignment.find({
      organizationId: organizationObjectId,
      academicYear,
      isActive: true
    }).select("studentId"),
    FeeLedger.aggregate<{ _id: Types.ObjectId; balance: number }>([
      { $match: { organizationId: organizationObjectId, academicYear } },
      {
        $group: {
          _id: "$studentId",
          balance: {
            $sum: {
              $max: [
                0,
                { $subtract: [{ $add: ["$amountDue", "$lateFee"] }, "$amountPaid"] }
              ]
            }
          }
        }
      }
    ])
  ]);

  const statusMap: StudentFeeStatusMap = {};

  for (const assignment of assignments) {
    const studentId = String(assignment.studentId);
    statusMap[studentId] = { balance: 0, assigned: true };
  }

  for (const row of balanceRows) {
    const studentId = String(row._id);
    const existing = statusMap[studentId];
    statusMap[studentId] = {
      balance: row.balance,
      assigned: existing?.assigned ?? false
    };
  }

  return statusMap;
};

export const buildStudentFeeStatusMapsByYear = async (
  organizationId: string,
  academicYears: string[]
): Promise<Map<string, StudentFeeStatusMap>> => {
  const uniqueYears = [...new Set(academicYears.filter((year) => year.length > 0))];
  const maps = await Promise.all(
    uniqueYears.map(async (academicYear) => ({
      academicYear,
      statusMap: await buildStudentFeeStatusMap(organizationId, academicYear)
    }))
  );

  return new Map(maps.map(({ academicYear, statusMap }) => [academicYear, statusMap]));
};

export const formatStudentFeeStatusLabel = (
  entry: StudentFeeStatusEntry | undefined
): { feeStatus: string; outstandingAmount: number } => {
  if (!entry?.assigned) {
    return { feeStatus: "Fees not assigned", outstandingAmount: 0 };
  }
  if (entry.balance <= 0) {
    return { feeStatus: "All paid", outstandingAmount: 0 };
  }

  const rounded = Math.round(entry.balance * 100) / 100;
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0
  }).format(rounded);

  return {
    feeStatus: `₹${formatted} due`,
    outstandingAmount: rounded
  };
};

export const buildStudentFeeLedgerView = async (
  organizationId: string,
  studentId: string,
  academicYear: string
) => {
  const orgObjectId = new Types.ObjectId(organizationId);
  const studentObjectId = new Types.ObjectId(studentId);

  await refreshOverdueStatuses({
    organizationId: orgObjectId,
    studentId: studentObjectId,
    academicYear
  });

  const student = await Student.findOne({
    _id: studentObjectId,
    organizationId: orgObjectId
  });

  if (!student) {
    return null;
  }

  const transport = await StudentTransport.findOne({
    organizationId: orgObjectId,
    studentId: studentObjectId,
    status: "active"
  }).populate("busId", "busNumber routeName");

  const assignment = await StudentFeeAssignment.findOne({
    organizationId: orgObjectId,
    studentId: studentObjectId,
    academicYear,
    isActive: true
  }).populate("feeStructureId", "name feeHeads");

  const ledgerEntries = await FeeLedger.find({
    organizationId: orgObjectId,
    studentId: studentObjectId,
    academicYear
  }).sort({ feeHeadName: 1, periodLabel: 1 });

  const payments = await SchoolFeePayment.find({
    organizationId: orgObjectId,
    studentId: studentObjectId,
    academicYear
  })
    .populate("collectedBy", "name")
    .sort({ paymentDate: -1 });

  const byFeeHead = new Map<
    string,
    {
      feeHeadName: string;
      periods: Array<{
        periodLabel: string;
        displayLabel: string;
        amountDue: number;
        amountPaid: number;
        lateFee: number;
        balance: number;
        status: string;
        dueDate?: Date;
      }>;
      totalDue: number;
      totalPaid: number;
      balance: number;
    }
  >();

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
    const group = byFeeHead.get(entry.feeHeadName)!;
    const balance = Math.max(0, entry.amountDue + entry.lateFee - entry.amountPaid);
    const displayLabel = entry.periodLabel.match(/^\d{4}-\d{2}$/)
      ? formatMonthDisplay(entry.periodLabel)
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
  const outstandingBalance = ledgerEntries.reduce(
    (s, e) => s + Math.max(0, e.amountDue + e.lateFee - e.amountPaid),
    0
  );
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
      bus: transport?.busId ?? null
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

export const buildReceiptView = async (
  organizationId: string,
  receiptNumber: string
) => {
  const payment = await SchoolFeePayment.findOne({
    organizationId: new Types.ObjectId(organizationId),
    receiptNumber
  })
    .populate("studentId", "name grade parentName")
    .populate("collectedBy", "name");

  if (!payment) {
    return null;
  }

  const student = payment.studentId as unknown as {
    name: string;
    grade: string;
    parentName: string;
  };
  const collector = payment.collectedBy as unknown as { name: string };

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

export const buildOrgFeeSummary = async (
  organizationId: string,
  academicYear: string,
  month?: string
) => {
  const orgObjectId = new Types.ObjectId(organizationId);
  const ledgerFilter: Record<string, unknown> = {
    organizationId: orgObjectId,
    academicYear
  };

  let ledgerEntries = await FeeLedger.find(ledgerFilter).populate("studentId", "grade");

  if (month) {
    ledgerEntries = ledgerEntries.filter((e) => periodMatchesMonth(e.periodLabel, month));
  }

  const paymentFilter: Record<string, unknown> = {
    organizationId: orgObjectId,
    academicYear
  };
  let payments = await SchoolFeePayment.find(paymentFilter);

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
  const totalOutstanding = ledgerEntries.reduce(
    (s, e) => s + Math.max(0, e.amountDue + e.lateFee - e.amountPaid),
    0
  );

  const byGradeMap = new Map<string, { due: number; collected: number; outstanding: number }>();
  const byFeeHeadMap = new Map<string, { due: number; collected: number; outstanding: number }>();

  for (const entry of ledgerEntries) {
    const student = entry.studentId as unknown as { grade?: string } | null;
    const grade = student?.grade ?? "Unknown";
    if (!byGradeMap.has(grade)) {
      byGradeMap.set(grade, { due: 0, collected: 0, outstanding: 0 });
    }
    const g = byGradeMap.get(grade)!;
    g.due += entry.amountDue;
    g.collected += entry.amountPaid;
    g.outstanding += Math.max(0, entry.amountDue + entry.lateFee - entry.amountPaid);

    if (!byFeeHeadMap.has(entry.feeHeadName)) {
      byFeeHeadMap.set(entry.feeHeadName, { due: 0, collected: 0, outstanding: 0 });
    }
    const f = byFeeHeadMap.get(entry.feeHeadName)!;
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
