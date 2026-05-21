"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { Bus, FeePayment } from "@/types";
import type { PaginatedResponse } from "@/types/pagination";

const FeeCollectionPage = (): JSX.Element => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busId, setBusId] = useState("");
  const [shouldLoad, setShouldLoad] = useState(false);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const busesQuery = useQuery({
    queryKey: ["bulk-fee-buses"],
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });

  const paymentsQuery = useQuery({
    queryKey: ["bulk-fee-list", month, busId],
    enabled: shouldLoad,
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<FeePayment>>("/api/fees", {
          params: { month, busId: busId || undefined, page: 1, limit: 100 }
        })
      ).data,
    placeholderData: keepPreviousData
  });

  const rows = useMemo(
    () =>
      (paymentsQuery.data?.data ?? []).filter((payment) =>
        ["pending", "overdue"].includes(payment.status)
      ),
    [paymentsQuery.data]
  );

  const selectedRows = rows.filter((row) => selectedPaymentIds.includes(row._id));
  const selectedTotal = selectedRows.reduce((sum, row) => sum + Math.max(0, row.amount - row.amountPaid), 0);

  const toggleRow = (paymentId: string): void => {
    setSelectedPaymentIds((prev) =>
      prev.includes(paymentId) ? prev.filter((id) => id !== paymentId) : [...prev, paymentId]
    );
  };

  const selectByStatus = (status: "pending" | "overdue"): void => {
    const statusIds = rows.filter((row) => row.status === status).map((row) => row._id);
    setSelectedPaymentIds((prev) => [...new Set([...prev, ...statusIds])]);
  };

  const markPaidMutation = useMutation({
    mutationFn: async () =>
      api.post<{ data: { marked: number; alreadyPaid: number } }>("/api/bulk/fees/mark-paid", {
        paymentIds: selectedPaymentIds,
        paymentMode: "cash",
        notes
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["bulk-fee-list"] });
      queryClient.invalidateQueries({ queryKey: ["fees"] });
      setSelectedPaymentIds([]);
      setNotes("");
      setConfirmOpen(false);
      showToast("success", `✓ ${res.data.data.marked} fee payments marked as paid`);
    },
    onError: () => showToast("error", "Failed to mark payments")
  });

  return (
    <PageWrapper title="Bulk Fee Collection">
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Month</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Bus</span>
            <select
              value={busId}
              onChange={(e) => setBusId(e.target.value)}
              className="rounded border px-3 py-2"
            >
              <option value="">All buses</option>
              {(busesQuery.data ?? []).map((bus) => (
                <option key={bus._id} value={bus._id}>
                  {bus.busNumber}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() => {
              setShouldLoad(true);
              setSelectedPaymentIds([]);
            }}
          >
            Load Students
          </Button>
        </div>
      </Card>

      <Card title="Pending / Overdue Fee Payments">
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => selectByStatus("pending")}>
            Select All Pending
          </Button>
          <Button variant="secondary" onClick={() => selectByStatus("overdue")}>
            Select All Overdue
          </Button>
        </div>

        {!shouldLoad || paymentsQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th />
                  <th>Student Name</th>
                  <th>Grade</th>
                  <th>Bus</th>
                  <th>Fee Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id} className="border-t border-slate-100">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selectedPaymentIds.includes(row._id)}
                        onChange={() => toggleRow(row._id)}
                      />
                    </td>
                    <td>{typeof row.studentId === "string" ? "—" : row.studentId.name}</td>
                    <td>{typeof row.studentId === "string" ? "—" : row.studentId.grade}</td>
                    <td>{typeof row.busId === "string" ? "—" : row.busId.busNumber}</td>
                    <td>{formatINR(Math.max(0, row.amount - row.amountPaid))}</td>
                    <td>
                      <Badge status={row.status}>{row.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedPaymentIds.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {selectedPaymentIds.length} students selected — Total: {formatINR(selectedTotal)}
              </p>
              <p className="text-xs text-slate-600">Payment mode: Cash</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="rounded border px-3 py-2 text-sm"
              />
              <Button onClick={() => setConfirmOpen(true)}>Mark All as Paid</Button>
            </div>
          </div>
        </Card>
      )}

      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Bulk Collection">
        <p className="mb-3 text-sm text-slate-700">
          Mark {selectedPaymentIds.length} students as paid?
        </p>
        <div className="max-h-52 overflow-auto rounded border border-slate-200">
          <ul className="divide-y divide-slate-100 text-sm">
            {selectedRows.map((row) => (
              <li key={row._id} className="px-3 py-2">
                {typeof row.studentId === "string" ? "Student" : row.studentId.name} —{" "}
                {formatINR(Math.max(0, row.amount - row.amountPaid))}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-800">Total: {formatINR(selectedTotal)}</p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => markPaidMutation.mutate()} disabled={markPaidMutation.isPending}>
            {markPaidMutation.isPending ? "Marking..." : "Confirm"}
          </Button>
        </div>
      </Modal>
    </PageWrapper>
  );
};

export default FeeCollectionPage;
