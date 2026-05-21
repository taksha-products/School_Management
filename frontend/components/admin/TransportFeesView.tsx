"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ListPagination } from "@/components/shared/ListPagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { ACADEMIC_YEAR } from "@/lib/constants";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/fileDownload";
import { formatINR } from "@/lib/utils";
import type { PaginatedResponse } from "@/types/pagination";
import type { Bus, FeePayment } from "@/types";

const paymentSchema = z.object({
  amountPaid: z.coerce.number().min(0),
  notes: z.string().optional()
});
type PaymentForm = z.infer<typeof paymentSchema>;

export const TransportFeesView = (): JSX.Element => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busId, setBusId] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<FeePayment | null>(null);
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const form = useForm<PaymentForm>({ resolver: zodResolver(paymentSchema) });

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

  const recordMutation = useMutation({
    mutationFn: async (payload: PaymentForm) => {
      if (!selectedPayment) return;
      const studentId =
        typeof selectedPayment.studentId === "string"
          ? selectedPayment.studentId
          : selectedPayment.studentId._id;
      return api.post("/api/fees/record", {
        studentId,
        month,
        academicYear: selectedPayment.academicYear,
        amountPaid: payload.amountPaid,
        notes: payload.notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fees"] });
      queryClient.invalidateQueries({ queryKey: ["nav-badge-transport-pending"] });
      queryClient.invalidateQueries({ queryKey: ["fees-tab-badge-transport"] });
      setSelectedPayment(null);
      form.reset();
      showToast("success", "Payment recorded");
    },
    onError: () => showToast("error", "Failed to record payment")
  });

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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {feeRows.map((payment) => {
                  const canPrintReceipt =
                    payment.status === "paid" || payment.status === "partial";
                  return (
                    <tr key={payment._id} className="border-t border-slate-100">
                      <td className="py-2">
                        {typeof payment.studentId === "string" ? "-" : payment.studentId.name}
                      </td>
                      <td>{typeof payment.studentId === "string" ? "-" : payment.studentId.grade}</td>
                      <td>{typeof payment.busId === "string" ? "-" : payment.busId.busNumber}</td>
                      <td>{formatINR(payment.amount)}</td>
                      <td>{formatINR(payment.amountPaid)}</td>
                      <td>
                        <Badge status={payment.status}>{payment.status}</Badge>
                      </td>
                      <td className="space-x-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelectedPayment(payment);
                            form.reset({
                              amountPaid: payment.amount,
                              notes: payment.notes ?? ""
                            });
                          }}
                        >
                          Mark as Paid
                        </Button>
                        <button
                          type="button"
                          className={
                            canPrintReceipt
                              ? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
                              : "rounded-md bg-gray-300 px-4 py-2 text-sm font-semibold text-gray-500 cursor-not-allowed opacity-50"
                          }
                          onClick={() => {
                            if (canPrintReceipt) {
                              window.open(`/receipt/${payment._id}`, "_blank");
                            }
                          }}
                        >
                          Print Receipt
                        </button>
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

      <Modal isOpen={!!selectedPayment} onClose={() => setSelectedPayment(null)} title="Mark Payment">
        <form className="grid gap-3" onSubmit={form.handleSubmit((v) => recordMutation.mutate(v))}>
          <input
            type="number"
            className="rounded border border-slate-200 px-3 py-2"
            {...form.register("amountPaid")}
          />
          <textarea
            className="rounded border border-slate-200 px-3 py-2"
            placeholder="Notes"
            {...form.register("notes")}
          />
          <Button type="submit" disabled={recordMutation.isPending}>
            Submit
          </Button>
        </form>
      </Modal>
    </>
  );
};
