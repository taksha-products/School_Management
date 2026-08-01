import { api } from "./api";

export type FeeType = "transport" | "school";

export interface CreateOrderResponse {
  success: boolean;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  receiptNumber: string;
}

export interface CreateUpiQrResponse {
  success: boolean;
  qrCodeUrl: string;
  qrCodeId: string;
  expiresAt: number;
}

export interface QrStatusResponse {
  success: boolean;
  status: "pending" | "paid";
  receiptNumber?: string;
}

export interface RecordCashResponse {
  success: boolean;
  receiptNumber: string;
}

export interface SchoolPaymentIntentResponse {
  success: boolean;
  data: {
    feePaymentId: string;
    amount: number;
    description: string;
    receiptNumber: string;
  };
}

export const createPaymentOrder = async (
  feeType: FeeType,
  feePaymentId: string,
  amount: number
): Promise<CreateOrderResponse> => {
  const res = await api.post<CreateOrderResponse>("/api/payments/create-order", {
    feeType,
    feePaymentId,
    amount
  });
  return res.data;
};

export const verifyPayment = async (params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  feeType: FeeType;
  feePaymentId: string;
}): Promise<VerifyPaymentResponse> => {
  const res = await api.post<VerifyPaymentResponse>("/api/payments/verify", params);
  return res.data;
};

export const createUpiQr = async (
  feeType: FeeType,
  feePaymentId: string,
  amount: number
): Promise<CreateUpiQrResponse> => {
  const res = await api.post<CreateUpiQrResponse>("/api/payments/create-upi-qr", {
    feeType,
    feePaymentId,
    amount
  });
  return res.data;
};

export const getQrStatus = async (qrCodeId: string): Promise<QrStatusResponse> => {
  const res = await api.get<QrStatusResponse>(`/api/payments/qr-status/${qrCodeId}`);
  return res.data;
};

export const recordCashPayment = async (params: {
  feeType: FeeType;
  feePaymentId: string;
  amount: number;
  notes?: string;
}): Promise<RecordCashResponse> => {
  const res = await api.post<RecordCashResponse>("/api/payments/record-cash", params);
  return res.data;
};

export const createSchoolPaymentIntent = async (
  studentId: string,
  academicYear: string,
  payments: Array<{
    feeHeadName: string;
    periodLabel: string;
    amountPaid: number;
    lateFee?: number;
  }>,
  options?: { parent?: boolean; notes?: string }
): Promise<SchoolPaymentIntentResponse["data"]> => {
  const url = options?.parent
    ? `/api/parent/children/${studentId}/payment-intent`
    : "/api/school-fees/payment-intent";

  const res = await api.post<SchoolPaymentIntentResponse>(url, {
    studentId: options?.parent ? undefined : studentId,
    academicYear,
    payments,
    notes: options?.notes
  });
  return res.data.data;
};

export type PaymentMode =
  | "cash"
  | "upi_office"
  | "upi_online"
  | "card"
  | "netbanking"
  | "cheque"
  | "other"
  | "upi"
  | "online";

export const paymentModeIcon = (mode?: PaymentMode | string): string => {
  if (!mode) return "—";
  if (mode === "cash") return "💵";
  if (mode === "card") return "💳";
  if (
    mode === "upi_online" ||
    mode === "upi_office" ||
    mode === "upi" ||
    mode === "online"
  ) {
    return "📱";
  }
  return "💳";
};
