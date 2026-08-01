/** Shared payment mode values for transport and school fee records. */
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

export type FeeType = "transport" | "school";

export const PAYMENT_MODE_VALUES: PaymentMode[] = [
  "cash",
  "upi_office",
  "upi_online",
  "card",
  "netbanking",
  "cheque",
  "other",
  "upi",
  "online"
];

/**
 * Maps Razorpay payment method to internal payment mode.
 */
export const mapRazorpayMethodToPaymentMode = (
  method: string,
  isOfficeQr: boolean
): PaymentMode => {
  if (isOfficeQr && method === "upi") {
    return "upi_office";
  }
  switch (method) {
    case "upi":
      return "upi_online";
    case "card":
      return "card";
    case "netbanking":
      return "netbanking";
    case "wallet":
      return "other";
    default:
      return "other";
  }
};
