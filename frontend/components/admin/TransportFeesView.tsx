"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useAcademicYear } from "@/hooks/useAcademicYear";
import { CollectAdvanceModal } from "@/components/fees/CollectAdvanceModal";
import { PaymentModeModal } from "@/components/payments/PaymentModeModal";
import { ReceiptDownload } from "@/components/payments/ReceiptDownload";
import { ListPagination } from "@/components/shared/ListPagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/fileDownload";
import { paymentModeIcon } from "@/lib/payments";
import { formatINR } from "@/lib/utils";
import type { PaginatedResponse } from "@/types/pagination";
import type { Bus, FeePayment } from "@/types";

interface PaymentModalState {
  feePaymentId: string;
  studentId: string;
  studentName: string;
  amount: number;
  description: string;
}

interface AdvanceModalState {
  studentId: string;
  studentName: string;
  busRoute: string;
}

export const TransportFeesView = (): JSX.Element => {
  const orgAcademicYear = useAcademicYear();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busId, setBusId] = useState("");
  const [paymentModal, setPaymentModal] = useState<PaymentModalState | null>(null);
  const [advanceModal, setAdvanceModal] = useState<AdvanceModalState | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [month, busId, debouncedSearch]);

  const busesQuery = useQuery({
    queryKey: ["buses-filter"],
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });

  const feesQuery = useQuery({
    queryKey: ["fees", { page, month, busId, academicYear: orgAcademicYear, search: debouncedSearch }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<FeePayment>>("/api/fees", {
          params: {
            month,
            busId: busId || undefined,
            academicYear: orgAcademicYear,
            search: debouncedSearch.trim() || undefined,
            page,
            limit: 50
          }
        })
      ).data,
    placeholderData: keepPreviousData
  });
  const feeRows = feesQuery.data?.data ?? [];
  const pagination = feesQuery.data?.pagination;

  const refreshFeeQueries = (): void => {
    queryClient.invalidateQueries({ queryKey: ["fees"] });
    queryClient.invalidateQueries({ queryKey: ["nav-badge-transport-pending"] });
    queryClient.invalidateQueries({ queryKey: ["fees-tab-badge-transport"] });
    queryClient.invalidateQueries({ queryKey: ["transport-advance-preview"] });
  };

  const handlePaymentSuccess = (receiptNumber: string): void => {
    refreshFeeQueries();
    showToast("success", `Payment recorded — ${receiptNumber}`);
    setPaymentModal(null);
  };

  const handleExport = async (): Promise<void> => {
    try {
      setIsExporting(true);
      await downloadFromApi(
        "/api/bulk/export/fees",
        `taksha_fees_${new Date().toISOString().slice(0, 10)}.xlsx`,
        { month, busId: busId || undefined }
      );
      showToast("success", "Fees export downloaded");
    } catch {
      showToast("error", "Failed to export fees");
    } finally {
      setIsExporting(false);
    }
  };

  const getOutstanding = (payment: FeePayment): number =>
    Math.max(0, payment.amount - payment.amountPaid);

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            Showing transport-registered students for {month}
            {pagination ? ` (${pagination.total} records)` : ""}
            {debouncedSearch.trim() ? ` · matching “${debouncedSearch.trim()}”` : ""}.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 self-end sm:self-auto"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? "Exporting..." : "Export"}
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student name or grade..."
            className="rounded border border-slate-200 px-3 py-2 text-sm md:col-span-1"
          />
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border border-slate-200 px-3 py-2"
          />
          <select
            value={busId}
            onChange={(e) => setBusId(e.target.value)}
            className="rounded border border-slate-200 px-3 py-2"
          >
            <option value="">All Buses</option>
            {(busesQuery.data ?? []).map((bus) => (
              <option key={bus._id} value={bus._id}>
                {bus.busNumber}
              </option>
            ))}
          </select>
        </div>
        {feesQuery.isLoading ? (
          <TableSkeleton />
        ) : feeRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {debouncedSearch.trim()
              ? "No transport students match your search for this month."
              : "No transport fee records for this month."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th>Student Name</th>
                  <th>Grade</th>
                  <th>Bus</th>
                  <th>Fee Due</th>
                  <th>Paid</th>
                  <th>Status</th>
                  <th>Mode</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {feeRows.map((payment) => {
                  const canCollect =
                    payment.status === "pending" || payment.status === "partial";
                  const canPrintReceipt =
                    payment.status === "paid" || payment.status === "partial";
                  const studentId =
                    typeof payment.studentId === "string"
                      ? payment.studentId
                      : payment.studentId._id;
                  const studentName =
                    typeof payment.studentId === "string" ? "-" : payment.studentId.name;
                  const outstanding = getOutstanding(payment);

                  return (
                    <tr key={payment._id} className="border-t border-slate-100">
                      <td className="py-2">{studentName}</td>
                      <td>
                        {typeof payment.studentId === "string" ? "-" : payment.studentId.grade}
                      </td>
                      <td>{typeof payment.busId === "string" ? "-" : payment.busId.busNumber}</td>
                      <td>{formatINR(payment.amount)}</td>
                      <td>{formatINR(payment.amountPaid)}</td>
                      <td>
                        <Badge status={payment.status}>{payment.status}</Badge>
                      </td>
                      <td>
                        {payment.paymentMode ? (
                          <span title={payment.paymentMode}>
                            {paymentModeIcon(payment.paymentMode)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="space-x-2 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mr-1"
                          onClick={() => {
                            const busNumber =
                              typeof payment.busId === "string"
                                ? undefined
                                : payment.busId.busNumber;
                            setAdvanceModal({
                              studentId,
                              studentName,
                              busRoute: busNumber ? `Bus ${busNumber}` : "Transport"
                            });
                          }}
                        >
                          Collect Advance
                        </Button>
                        {canCollect && (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setPaymentModal({
                                feePaymentId: payment._id,
                                studentId,
                                studentName,
                                amount: outstanding,
                                description: `Transport fee ${payment.month} (${payment.academicYear})`
                              })
                            }
                          >
                            Collect
                          </Button>
                        )}
                        {canPrintReceipt && payment.amountPaid > 0 && (
                          <ReceiptDownload
                            feeType="transport"
                            receiptNumber={`RCP-T-${payment._id.slice(-8).toUpperCase()}`}
                            paymentId={payment._id}
                            variant="secondary"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pagination && (
          <ListPagination pagination={pagination} noun="fee records" onPageChange={setPage} />
        )}
      </div>

      {paymentModal && (
        <PaymentModeModal
          isOpen={!!paymentModal}
          onClose={() => setPaymentModal(null)}
          studentName={paymentModal.studentName}
          studentId={paymentModal.studentId}
          feePaymentId={paymentModal.feePaymentId}
          feeType="transport"
          amount={paymentModal.amount}
          description={paymentModal.description}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {advanceModal && (
        <CollectAdvanceModal
          isOpen={!!advanceModal}
          onClose={() => setAdvanceModal(null)}
          studentId={advanceModal.studentId}
          studentName={advanceModal.studentName}
          busRoute={advanceModal.busRoute}
          academicYear={orgAcademicYear}
          fromMonth={month}
          onSuccess={refreshFeeQueries}
        />
      )}
    </>
  );
};
