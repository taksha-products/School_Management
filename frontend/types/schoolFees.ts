export type FeeHeadFrequency = "monthly" | "quarterly" | "annual" | "oneTime";
export type FeeHeadCategory = "academic" | "transport" | "facility" | "exam" | "other";
export type SchoolPaymentMode = "cash" | "upi" | "cheque" | "online";

export interface FeeHead {
  name: string;
  amount: number;
  frequency: FeeHeadFrequency;
  dueDay: number;
  isOptional: boolean;
  category: FeeHeadCategory;
}

export interface FeeStructure {
  _id: string;
  name: string;
  academicYear: string;
  applicableGrades: string[];
  feeHeads: FeeHead[];
  isActive: boolean;
}

export interface Organization {
  _id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  plan: "trial" | "basic" | "pro";
  isActive: boolean;
  studentCount?: number;
  createdAt?: string;
}

export interface OrgUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  staffPermissions?: StaffPermissions;
  parentStudentIds?: Array<string | { _id: string; name: string; grade: string }>;
  students?: Array<{ _id: string; name: string; grade: string }>;
  organizationId?: { _id: string; name: string; code: string } | string;
}

export interface StaffPermissions {
  canCollectFees: boolean;
  canManageStudents: boolean;
  canViewReports: boolean;
  canManageBuses: boolean;
}

export interface LedgerPeriod {
  periodLabel: string;
  displayLabel: string;
  amountDue: number;
  amountPaid: number;
  lateFee: number;
  balance: number;
  status: string;
  dueDate?: string;
}

export interface FeeHeadLedgerGroup {
  feeHeadName: string;
  periods: LedgerPeriod[];
  totalDue: number;
  totalPaid: number;
  balance: number;
}

export interface StudentFeeLedgerView {
  student: {
    _id: string;
    name: string;
    grade: string;
    parentName: string;
    parentPhone: string;
    bus?: { busNumber?: string; routeName?: string };
  };
  feeHeads: FeeHeadLedgerGroup[];
  summary: {
    totalDue: number;
    totalPaid: number;
    totalLateFee: number;
    outstandingBalance: number;
    overdueAmount: number;
  };
  upcomingDues: Array<{
    feeHeadName: string;
    periodLabel: string;
    amountDue: number;
    dueDate?: string;
    balance: number;
  }>;
  paymentHistory: SchoolFeePayment[];
}

export interface OutstandingStudent {
  studentId: string;
  studentName: string;
  grade: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
  overdueAmount: number;
}

export interface SchoolFeePayment {
  _id: string;
  receiptNumber: string;
  paymentDate: string;
  paymentMode: SchoolPaymentMode;
  totalAmountPaid: number;
  totalAmountDue: number;
  feeHeadPayments: Array<{
    feeHeadName: string;
    periodLabel: string;
    amountPaid: number;
    amountDue: number;
    lateFee: number;
    status: string;
  }>;
  notes?: string;
  collectedBy?: { name: string } | string;
}

export interface SchoolFeeReceipt {
  receiptNumber: string;
  paymentDate: string;
  paymentMode: string;
  upiTransactionId?: string;
  studentName: string;
  grade: string;
  parentName?: string;
  feeHeadPayments: SchoolFeePayment["feeHeadPayments"];
  totalAmountDue: number;
  totalAmountPaid: number;
  totalLateFee: number;
  collectedBy?: string;
  notes?: string;
}

export interface SchoolFeeSummary {
  totalDue: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
  byGrade: Array<{ grade: string; due: number; collected: number; outstanding: number }>;
  byFeeHead: Array<{ feeHeadName: string; due: number; collected: number; outstanding: number }>;
}
