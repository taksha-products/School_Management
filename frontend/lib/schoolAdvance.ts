import type { LedgerPeriod, StudentFeeLedgerView } from "@/types/schoolFees";

export type SchoolAdvanceRow = {
  key: string;
  feeHeadName: string;
  periodLabel: string;
  displayLabel: string;
  balance: number;
  status: string;
  selectable: boolean;
};

const canCollectStatus = (status: string): boolean =>
  status === "pending" || status === "partial" || status === "overdue";

export const ledgerToAdvanceRows = (ledger: StudentFeeLedgerView | undefined): SchoolAdvanceRow[] => {
  if (!ledger) {
    return [];
  }
  const rows: SchoolAdvanceRow[] = [];
  for (const head of ledger.feeHeads) {
    for (const period of head.periods) {
      const selectable = canCollectStatus(period.status) && period.balance > 0;
      if (!selectable && period.status === "paid") {
        continue;
      }
      rows.push({
        key: `${head.feeHeadName}::${period.periodLabel}`,
        feeHeadName: head.feeHeadName,
        periodLabel: period.periodLabel,
        displayLabel: period.displayLabel,
        balance: period.balance,
        status: period.status,
        selectable
      });
    }
  }
  return rows.sort((a, b) => a.periodLabel.localeCompare(b.periodLabel));
};

export const pickEarliestSchoolPeriodKeys = (rows: SchoolAdvanceRow[], count: number): string[] =>
  rows
    .filter((r) => r.selectable)
    .slice(0, Math.max(1, Math.min(count, 12)))
    .map((r) => r.key);

export const schoolAdvanceKeysToPayments = (
  rows: SchoolAdvanceRow[],
  selectedKeys: string[]
): Array<{ feeHeadName: string; periodLabel: string; amountPaid: number }> =>
  selectedKeys
    .map((key) => rows.find((r) => r.key === key))
    .filter((r): r is SchoolAdvanceRow => !!r && r.selectable)
    .map((r) => ({
      feeHeadName: r.feeHeadName,
      periodLabel: r.periodLabel,
      amountPaid: r.balance
    }));
