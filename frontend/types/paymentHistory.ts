export interface PaymentHistoryEntry {
  id: string;
  feeType: "transport" | "school";
  studentId: string;
  studentName: string;
  grade: string;
  receiptNumber: string;
  amountPaid: number;
  paymentMode: string;
  paidAt: string;
  description: string;
  transportPaymentId: string | null;
  schoolReceiptNumber: string | null;
}
