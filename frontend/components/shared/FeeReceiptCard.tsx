"use client";

import {
  Calendar,
  Check,
  CreditCard,
  Download,
  Printer,
  User,
  type LucideIcon
} from "lucide-react";
import type { JSX, ReactNode, RefObject } from "react";

import { Button } from "@/components/ui/Button";
import { useOrgTheme } from "@/hooks/useOrgTheme";
import { getOrgDisplayLabel, normalizeBrandColor } from "@/lib/brandColor";
import {
  formatPaymentModeLabel,
  formatReceiptDateLong,
  formatReceiptDisplayId,
  isReceiptFullyPaid,
  RECEIPT_PDF_WIDTH_PX,
  type ReceiptPaymentStatus
} from "@/lib/receiptFormat";
import { formatINR } from "@/lib/utils";
import type { ReceiptOrgBranding } from "@/types/orgTheme";

const RECEIPT_WIDTH_CLASS = "w-[440px] max-w-full min-w-0";
const RECEIPT_ICON_COL = "w-11 shrink-0";
const RECEIPT_VALUE_COL = "w-[168px] shrink-0 text-right";
const RECEIPT_TABLE_COLGROUP = (
  <colgroup>
    <col className="w-11" />
    <col />
    <col className="w-[168px]" />
  </colgroup>
);

export interface FeeReceiptLineItem {
  label: string;
  period?: string;
  amount: number;
}

export interface FeeReceiptCardProps {
  contentRef: RefObject<HTMLDivElement>;
  branding?: ReceiptOrgBranding | null;
  receiptType: string;
  period: string;
  receiptNumber: string;
  studentName: string;
  studentMeta: string;
  status: ReceiptPaymentStatus;
  paymentDate?: string | null;
  collectedBy?: string | null;
  paymentMode?: string | null;
  amountDue: number;
  amountPaid: number;
  lineItems?: FeeReceiptLineItem[];
  showActions?: boolean;
  pdfLoading?: boolean;
  onDownloadPdf?: () => void;
  onPrint?: () => void;
  footerNote?: ReactNode;
}

const ReceiptDetailRow = ({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}): JSX.Element => (
  <tr>
    <td className={`${RECEIPT_ICON_COL} align-top py-1.5`}>
      <Icon className="mx-auto h-[18px] w-[18px] text-slate-400" strokeWidth={2} aria-hidden />
    </td>
    <td className="py-1.5 pr-2 align-top text-slate-500">{label}</td>
    <td
      className={`${RECEIPT_VALUE_COL} py-1.5 align-top text-[13px] font-medium leading-snug text-slate-900`}
    >
      {value}
    </td>
  </tr>
);

const ReceiptAmountRow = ({
  label,
  value,
  valueClassName = "font-semibold text-slate-900"
}: {
  label: string;
  value: string;
  valueClassName?: string;
}): JSX.Element => (
  <tr>
    <td className={RECEIPT_ICON_COL} aria-hidden />
    <td className="py-0.5 text-sm text-slate-600">{label}</td>
    <td className={`${RECEIPT_VALUE_COL} py-0.5 text-sm ${valueClassName}`}>{value}</td>
  </tr>
);

const statusBadge = (
  status: ReceiptPaymentStatus
): { label: string; className: string } => {
  const normalized = status.toLowerCase();
  if (normalized === "paid") {
    return { label: "Paid", className: "bg-emerald-100 text-emerald-800" };
  }
  if (normalized === "partial") {
    return { label: "Partial", className: "bg-amber-100 text-amber-800" };
  }
  if (normalized === "pending") {
    return { label: "Pending", className: "bg-orange-100 text-orange-800" };
  }
  return {
    label: status.charAt(0).toUpperCase() + status.slice(1),
    className: "bg-slate-100 text-slate-700"
  };
};

export const FeeReceiptCard = ({
  contentRef,
  branding,
  receiptType,
  period,
  receiptNumber,
  studentName,
  studentMeta,
  status,
  paymentDate,
  collectedBy,
  paymentMode,
  amountDue,
  amountPaid,
  lineItems,
  showActions = true,
  pdfLoading = false,
  onDownloadPdf,
  onPrint,
  footerNote
}: FeeReceiptCardProps): JSX.Element => {
  const { theme } = useOrgTheme();
  const resolved = branding ?? theme;
  const displayName = getOrgDisplayLabel(resolved);
  const brandHex = normalizeBrandColor(resolved.brandColor);
  const contactSubtitle = [branding?.address, branding?.phone]
    .filter(Boolean)
    .join(" · ");
  const contactFooter = [branding?.phone, branding?.email].filter(Boolean).join(" · ");
  const badge = statusBadge(status);
  const fullyPaid = isReceiptFullyPaid(status, amountDue, amountPaid);
  const displayId = formatReceiptDisplayId(receiptNumber);

  return (
    <div className={RECEIPT_WIDTH_CLASS}>
      <div
        ref={contentRef}
        className={`fee-receipt-pdf-capture fee-receipt-card ${RECEIPT_WIDTH_CLASS} box-border overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5 print:shadow-none print:ring-0`}
        style={{ width: RECEIPT_PDF_WIDTH_PX }}
      >
        {/* Zone 1 — Header */}
        <div
          className="fee-receipt-header px-5 pb-5 pt-5 text-white"
          style={{
            backgroundColor: brandHex,
            WebkitPrintColorAdjust: "exact",
            printColorAdjust: "exact"
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {resolved.logoUrl ? (
                <img
                  src={resolved.logoUrl}
                  alt={displayName}
                  className="block max-h-[72px] w-auto max-w-[min(280px,100%)] object-contain object-left"
                  crossOrigin="anonymous"
                />
              ) : (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/30 text-lg font-bold text-white"
                  aria-hidden
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                Receipt
              </p>
              <p className="mt-0.5 text-[20px] font-semibold leading-none tracking-tight text-white">
                #{displayId}
              </p>
            </div>
          </div>

          <div className="mt-3 min-w-0">
            <p className="text-sm font-semibold leading-snug text-white">{displayName}</p>
            {contactSubtitle ? (
              <p
                className="mt-0.5 text-xs leading-relaxed"
                style={{ color: "rgba(255,255,255,0.65)" }}
              >
                {contactSubtitle}
              </p>
            ) : null}
          </div>

          <div
            className="mt-4 grid grid-cols-2 gap-4 rounded-xl px-4 py-3"
            style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
          >
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                Receipt type
              </p>
              <p className="mt-1 text-sm font-medium leading-snug text-white">{receiptType}</p>
            </div>
            <div className="text-right">
              <p
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                Period
              </p>
              <p className="mt-1 text-sm font-medium leading-snug text-white">{period}</p>
            </div>
          </div>
        </div>

        {/* Zone 2 — Body */}
        <div className="bg-white px-5 py-4">
          <div
            className="grid items-center border-b border-dashed border-slate-200 pb-3"
            style={{ gridTemplateColumns: "44px 1fr 168px" }}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <User className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 px-1">
              <p className="text-sm font-semibold text-slate-900">{studentName}</p>
              <p className="mt-0.5 text-xs text-slate-500">{studentMeta}</p>
            </div>
            <div className="flex justify-end">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
                {badge.label}
              </span>
            </div>
          </div>

          <table className="mt-3 w-full table-fixed border-collapse text-sm">
            {RECEIPT_TABLE_COLGROUP}
            <tbody>
              <ReceiptDetailRow
                icon={Calendar}
                label="Payment date"
                value={formatReceiptDateLong(paymentDate)}
              />
              <ReceiptDetailRow
                icon={User}
                label="Collected by"
                value={displayName}
              />
              <ReceiptDetailRow
                icon={CreditCard}
                label="Payment mode"
                value={formatPaymentModeLabel(paymentMode)}
              />
            </tbody>
          </table>

          {lineItems && lineItems.length > 0 ? (
            <div className="mt-4 space-y-2 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
              {lineItems.map((item) => (
                <div
                  key={`${item.label}-${item.period ?? ""}-${item.amount}`}
                  className="flex justify-between gap-3 text-slate-600"
                >
                  <span className="min-w-0 leading-snug">
                    {item.label}
                    {item.period ? ` · ${item.period}` : ""}
                  </span>
                  <span className="shrink-0 font-semibold text-slate-800">
                    {formatINR(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 overflow-hidden rounded-[10px] border border-slate-200 bg-slate-50 py-3">
            <table className="w-full table-fixed border-collapse">
              {RECEIPT_TABLE_COLGROUP}
              <tbody>
                <ReceiptAmountRow label="Amount due" value={formatINR(amountDue)} />
                <tr>
                  <td colSpan={3} className="py-0">
                    <div className="my-2.5 h-px bg-slate-200/80" />
                  </td>
                </tr>
                <ReceiptAmountRow
                  label="Amount paid"
                  value={formatINR(amountPaid)}
                  valueClassName="text-[22px] font-semibold leading-none text-[#166534]"
                />
              </tbody>
            </table>
          </div>

          {fullyPaid ? (
            <div
              className="mt-3 flex items-center gap-2.5 rounded-lg px-4 py-2 text-xs font-medium"
              style={{
                backgroundColor: "#F0FDF4",
                border: "1px solid #BBF7D0",
                color: "#065F46"
              }}
            >
              <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.5} />
              Payment received in full
            </div>
          ) : null}

          {footerNote}
        </div>

        {/* Zone 3 — Footer metadata (included in PDF) */}
        <div className="border-t border-dashed border-slate-200 bg-white px-5 pb-5 pt-3">
          {contactFooter ? (
            <p className="text-center text-xs leading-snug text-slate-500">{contactFooter}</p>
          ) : null}
          <p className="mt-1 text-center text-[11px] leading-snug text-slate-400">
            Thank you for your payment. Please keep this receipt for records.
          </p>
        </div>
      </div>

      {showActions ? (
        <div className="no-print mt-3 flex gap-2.5 rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-4 shadow-sm">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 flex-1 gap-2 rounded-lg text-sm"
            onClick={onPrint ?? (() => window.print())}
          >
            <Printer className="h-4 w-4" strokeWidth={2} />
            Print
          </Button>
          <Button
            type="button"
            className="min-h-11 flex-[2] gap-2 rounded-lg border-0 text-sm text-white hover:opacity-90"
            style={{ backgroundColor: brandHex }}
            disabled={pdfLoading}
            onClick={onDownloadPdf}
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            {pdfLoading ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
