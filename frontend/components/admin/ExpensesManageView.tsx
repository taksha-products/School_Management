"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type JSX } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ListPagination } from "@/components/shared/ListPagination";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { PaginatedResponse } from "@/types/pagination";
import type { Bus, Expense } from "@/types";

const expenseSchema = z.object({
  busId: z.string().min(1),
  category: z.enum(["diesel", "maintenance", "other"]),
  amount: z.coerce.number().min(1),
  date: z.string().min(1),
  vendor: z.string().min(1),
  notes: z.string().optional(),
  academicYear: z.string().min(4)
});
type ExpenseForm = z.infer<typeof expenseSchema>;

const defaultFormValues: ExpenseForm = {
  busId: "",
  category: "diesel",
  amount: 0,
  date: new Date().toISOString().slice(0, 10),
  vendor: "",
  notes: "",
  academicYear: "2025-26"
};

export const ExpensesManageView = (): JSX.Element => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [busId, setBusId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [category, setCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [busId, month, category]);

  const form = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: defaultFormValues
  });

  const busesQuery = useQuery({
    queryKey: ["buses-expense"],
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });

  const expensesQuery = useQuery({
    queryKey: ["expenses", { page, busId, month, category }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<Expense>>("/api/expenses", {
          params: {
            busId: busId || undefined,
            month,
            category: category || undefined,
            academicYear: "2025-26",
            page,
            limit: 30
          }
        })
      ).data,
    placeholderData: keepPreviousData
  });

  const expenseRows = expensesQuery.data?.data ?? [];
  const pagination = expensesQuery.data?.pagination;

  const closeForm = (): void => {
    setFormOpen(false);
    setEditingId(null);
    form.reset(defaultFormValues);
  };

  const openCreateForm = (): void => {
    setEditingId(null);
    form.reset(defaultFormValues);
    setFormOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: ExpenseForm) => {
      if (editingId) {
        return api.put(`/api/expenses/${editingId}`, payload);
      }
      return api.post("/api/expenses", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      closeForm();
      showToast("success", "Expense saved");
    },
    onError: () => showToast("error", "Failed to save expense")
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      showToast("success", "Expense deleted");
    },
    onError: () => showToast("error", "Failed to delete expense")
  });

  const total = useMemo(
    () => expenseRows.reduce((acc, item) => acc + item.amount, 0),
    [expenseRows]
  );

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreateForm}>Add Expense</Button>
      </div>

      <Card title="Expense List">
        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <select value={busId} onChange={(e) => setBusId(e.target.value)} className="rounded border px-3 py-2">
            <option value="">All Buses</option>
            {(busesQuery.data ?? []).map((bus) => (
              <option key={bus._id} value={bus._id}>
                {bus.busNumber}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border px-3 py-2"
          >
            <option value="">All Categories</option>
            <option value="diesel">diesel</option>
            <option value="maintenance">maintenance</option>
            <option value="other">other</option>
          </select>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </div>
        {expensesQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[860px] w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th>Date</th>
                    <th>Bus</th>
                    <th>Category</th>
                    <th>Vendor</th>
                    <th>Amount</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.map((expense) => (
                    <tr key={expense._id} className="border-t">
                      <td className="py-2">
                        {new Date(expense.date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric"
                        })}
                      </td>
                      <td>{typeof expense.busId === "string" ? "-" : expense.busId.busNumber}</td>
                      <td>{expense.category}</td>
                      <td>{expense.vendor}</td>
                      <td>{formatINR(expense.amount)}</td>
                      <td className="space-x-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingId(expense._id);
                            form.reset({
                              busId:
                                typeof expense.busId === "string"
                                  ? expense.busId
                                  : expense.busId._id,
                              category: expense.category,
                              amount: expense.amount,
                              date: expense.date.slice(0, 10),
                              vendor: expense.vendor,
                              notes: expense.notes ?? "",
                              academicYear: expense.academicYear
                            });
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="danger" onClick={() => deleteMutation.mutate(expense._id)}>
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-right text-sm font-semibold">Page total: {formatINR(total)}</p>
            {pagination && (
              <ListPagination pagination={pagination} noun="expenses" onPageChange={setPage} />
            )}
          </>
        )}
      </Card>

      <Modal
        isOpen={formOpen}
        title={editingId ? "Edit Expense" : "Add Expense"}
        onClose={closeForm}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              onClick={() => void form.handleSubmit((values) => saveMutation.mutate(values))()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : editingId ? "Update Expense" : "Add Expense"}
            </Button>
          </>
        }
      >
        <form className="grid gap-3" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <select {...form.register("busId")} className="rounded border px-3 py-2">
            <option value="">Select Bus</option>
            {(busesQuery.data ?? []).map((bus) => (
              <option key={bus._id} value={bus._id}>
                {bus.busNumber}
              </option>
            ))}
          </select>
          <p className="text-xs text-rose-500">{form.formState.errors.busId?.message}</p>
          <select {...form.register("category")} className="rounded border px-3 py-2">
            <option value="diesel">diesel</option>
            <option value="maintenance">maintenance</option>
            <option value="other">other</option>
          </select>
          <input
            type="number"
            {...form.register("amount")}
            placeholder="Amount"
            className="rounded border px-3 py-2"
          />
          <input type="date" {...form.register("date")} className="rounded border px-3 py-2" />
          <input {...form.register("vendor")} placeholder="Vendor" className="rounded border px-3 py-2" />
          <textarea {...form.register("notes")} placeholder="Notes" className="rounded border px-3 py-2" />
          <input
            {...form.register("academicYear")}
            placeholder="Academic Year"
            className="rounded border px-3 py-2"
          />
        </form>
      </Modal>
    </>
  );
};
