"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { PaymentModeModal } from "@/components/payments/PaymentModeModal";
import { ReceiptDownload } from "@/components/payments/ReceiptDownload";
import { ListPagination } from "@/components/shared/ListPagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { ACADEMIC_YEAR } from "@/lib/constants";
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

export const TransportFeesView = (): JSX.Element => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busId, setBusId] = useState("");
  const [paymentModal, setPaymentModal] = useState<PaymentModalState | null>(null);
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [month, busId]);

  const busesQuery = useQuery({
    queryKey: ["buses-filter"],
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });

  const feesQuery = useQuery({
    queryKey: ["fees", { page, month, busId, academicYear: ACADEMIC_YEAR }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<FeePayment>>("/api/fees", {
          params: {
            month,
            busId: busId || undefined,
            academicYear: ACADEMIC_YEAR,
            page,
            limit: 50
          }
        })
      ).data,
    placeholderData: keepPreviousData
  });
  const feeRows = feesQuery.data?.data ?? [];
  const pagination = feesQuery.data?.pagination;

  const handlePaymentSuccess = (receiptNumber: string): void => {
    queryClient.invalidateQueries({ queryKey: ["fees"] });
    queryClient.invalidateQueries({ queryKey: ["nav-badge-transport-pending"] });
    queryClient.invalidateQueries({ queryKey: ["fees-tab-badge-transport"] });
    showToast("success", `Payment recorded — ${receiptNumber}`);
    setPaymentModal(null);
  };

  const handleExport = async (): Promise<void> => {
    try {
      setIsExporting(true);
      await downloadFromApi(
        "/api/bulk/export/fees",
        `bustrack_fees_${new Date().toISOString().slice(0, 10)}.xlsx`,
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
      <div className="mb-3 flex justify-end">
        <Button variant="secondary" onClick={handleExport} disabled={isExporting}>
          {isExporting ? "Exporting..." : "Export"}
        </Button>
      </div>
      <Card>
        <p className="mb-3 text-sm text-slate-600">
          Showing transport-registered students for {month}
          {pagination ? ` (${pagination.total} records)` : ""}.
        </p>
        <div className="mb-3 grid gap-2 md:grid-cols-2">
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
      </Card>

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
    </>
  );
};
