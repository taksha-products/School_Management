const RECEIPT_FALLBACK_BRAND = "#6B0F1A";

/** Receipt card width in CSS px — keep in sync with FeeReceiptCard layout. */
export const RECEIPT_PDF_WIDTH_PX = 440;

export const receiptBrandBackground = (brandColor?: string | null): string =>
  brandColor && /^#[0-9A-Fa-f]{6}$/.test(brandColor)
    ? brandColor
    : `var(--brand-color, ${RECEIPT_FALLBACK_BRAND})`;

export const formatReceiptDisplayId = (receiptId: string): string => {
  const trimmed = receiptId.trim();
  if (!trimmed) {
    return "000000";
  }
  return trimmed.slice(-6).toUpperCase();
};

export const formatReceiptDateLong = (date?: string | null): string => {
  if (!date) {
    return "—";
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  online: "Online",
  cheque: "Cheque",
  card: "Card",
  netbanking: "Net banking",
  other: "Other",
  upi_office: "UPI QR (Office)",
  upi_online: "UPI (Online)"
};

export const formatPaymentModeLabel = (mode?: string | null): string => {
  if (!mode?.trim()) {
    return "—";
  }
  const normalized = mode.trim().toLowerCase();
  const mapped = PAYMENT_MODE_LABELS[normalized];
  if (mapped) {
    return mapped;
  }
  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export const formatBusLabel = (busNumber?: string | null): string | null => {
  const trimmed = busNumber?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^bus[\s#-]/i.test(trimmed)) {
    return trimmed;
  }
  return `Bus ${trimmed}`;
};

export const formatTransportMonthPeriod = (month?: string): string => {
  if (!month) {
    return "—";
  }
  const parsed = new Date(`${month}-01`);
  if (Number.isNaN(parsed.getTime())) {
    return month;
  }
  return parsed.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

export const schoolReceiptPeriodLabel = (
  lines: Array<{ periodLabel: string }>
): string => {
  const unique = [...new Set(lines.map((line) => line.periodLabel.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return "—";
  }
  if (unique.length === 1) {
    return unique[0];
  }
  if (unique.length <= 2) {
    return unique.join(" · ");
  }
  return `${unique[0]} +${unique.length - 1} more`;
};

export type ReceiptPaymentStatus = "paid" | "partial" | "pending" | string;

export const isReceiptFullyPaid = (
  status: ReceiptPaymentStatus,
  amountDue: number,
  amountPaid: number
): boolean => {
  if (status === "paid") {
    return true;
  }
  return amountDue > 0 && amountPaid >= amountDue;
};
