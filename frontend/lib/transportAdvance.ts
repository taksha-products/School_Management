import { api } from "@/lib/api";
import { formatTransportMonthPeriod } from "@/lib/receiptFormat";

export type TransportMonthStatus = "paid" | "partial" | "pending" | "overdue";

export interface TransportAdvanceMonthRow {
  month: string;
  amount: number;
  amountPaid: number;
  status: TransportMonthStatus;
  feePaymentId: string | null;
  selectable: boolean;
}

export interface TransportAdvancePreview {
  studentId: string;
  studentName: string;
  grade: string;
  academicYear: string;
  monthlyFee: number;
  busNumber: string | null;
  routeName: string | null;
  months: TransportAdvanceMonthRow[];
}

export type AdvancePaymentModeUi = "cash" | "upi" | "online";

export const advanceUiModeToApi = (mode: AdvancePaymentModeUi): string => {
  if (mode === "upi") {
    return "upi_office";
  }
  return mode;
};

export const formatAdvanceMonthLabel = (month: string): string =>
  formatTransportMonthPeriod(month);

export const fetchTransportAdvancePreview = async (
  studentId: string,
  academicYear: string,
  fromMonth?: string
): Promise<TransportAdvancePreview> => {
  const res = await api.get<{ data: TransportAdvancePreview }>(
    `/api/fees/transport/student/${studentId}`,
    { params: { academicYear, fromMonth } }
  );
  return res.data.data;
};

export interface RecordTransportAdvanceResult {
  feeGroup: { receiptNumber?: string; _id: string };
  payments: Array<{ _id: string }>;
  primaryPaymentId: string | null;
}

export const recordTransportAdvance = async (params: {
  studentId: string;
  academicYear: string;
  months: string[];
  amountPaid: number;
  paymentMode: AdvancePaymentModeUi;
  notes?: string;
}): Promise<RecordTransportAdvanceResult> => {
  const res = await api.post<{ data: RecordTransportAdvanceResult }>(
    "/api/fees/record-advance",
    {
      studentId: params.studentId,
      academicYear: params.academicYear,
      months: params.months,
      amountPaid: params.amountPaid,
      paymentMode: advanceUiModeToApi(params.paymentMode),
      notes: params.notes
    }
  );
  return res.data.data;
};

export const selectableUnpaidMonths = (
  months: TransportAdvanceMonthRow[]
): TransportAdvanceMonthRow[] => months.filter((m) => m.selectable);

export const pickEarliestUnpaidMonths = (
  months: TransportAdvanceMonthRow[],
  count: number
): string[] => {
  const unpaid = selectableUnpaidMonths(months);
  return unpaid.slice(0, count).map((m) => m.month);
};

export const formatMonthListShort = (monthKeys: string[]): string =>
  monthKeys.map((m) => formatAdvanceMonthLabel(m)).join(", ");
