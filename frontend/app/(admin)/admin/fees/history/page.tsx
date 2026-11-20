"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { StudentSearch } from "@/components/shared/StudentSearch";
import { ListPagination } from "@/components/shared/ListPagination";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { Student } from "@/types";
import type { PaginatedResponse } from "@/types/pagination";
import type { PaymentHistoryEntry } from "@/types/paymentHistory";

const PaymentHistoryContent = (): JSX.Element => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectId = searchParams.get("studentId");
  const [student, setStudent] = useState<Student | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!preselectId) {
      setStudent(null);
      return;
    }
    api
      .get<{ data: Student }>(`/api/students/${preselectId}`)
      .then((res) => setStudent(res.data.data))
      .catch(() => setStudent(null));
  }, [preselectId]);

  useEffect(() => {
    setPage(1);
  }, [student?._id]);

  const historyQuery = useQuery({
    queryKey: ["payment-history-audit", student?._id ?? "all", { page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<PaymentHistoryEntry>>("/api/fees/payment-history", {
          params: {
            page,
            limit: 20,
            ...(student?._id ? { studentId: student._id } : {})
          }
        })
      ).data,
    placeholderData: keepPreviousData
  });

  const rows = historyQuery.data?.data ?? [];
  const pagination = historyQuery.data?.pagination;

  const handleSelectStudent = (selected: Student): void => {
    setStudent(selected);
    router.replace(`/admin/fees/history?studentId=${selected._id}`, { scroll: false });
  };

  const clearStudent = (): void => {
    setStudent(null);
    router.replace("/admin/fees/history", { scroll: false });
  };

  return (
    <PageWrapper title="Payment History">
      <Card className="mb-4">
        <StudentSearch
          onSelect={handleSelectStudent}
          placeholder="Search student to filter payment history..."
          activeTransportOnly={false}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {student ? (
            <>
              <p className="text-sm text-slate-600">
                Filter: <span className="font-medium">{student.name}</span> (Grade {student.grade})
              </p>
              <Button variant="ghost" size="sm" onClick={clearStudent}>
                Show all payments
              </Button>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Recent school and transport payments across all academic years (audit log).
            </p>
          )}
        </div>
      </Card>

      <Card>
        {historyQuery.isLoading ? (
          <TableSkeleton />
        ) : historyQuery.isError ? (
          <p className="py-6 text-center text-sm text-rose-600">
            Could not load payment history. Restart the backend if you recently updated the API.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No payments recorded yet for this view.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="p-2">Date</th>
                  <th>Student</th>
                  <th>Type</th>
                  <th>Details</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((payment) => (
                  <tr key={`${payment.feeType}-${payment.id}`} className="border-t border-slate-100">
                    <td className="p-2 whitespace-nowrap">
                      {new Date(payment.paidAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                      })}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-left font-medium text-slate-900 hover:text-amber-700"
                        onClick={() =>
                          router.replace(`/admin/fees/history?studentId=${payment.studentId}`, {
                            scroll: false
                          })
                        }
                      >
                        {payment.studentName}
                      </button>
                      <p className="text-xs text-slate-500">{payment.grade}</p>
                    </td>
                    <td>
                      <Badge status={payment.feeType === "transport" ? "pending" : "active"}>
                        {payment.feeType === "transport" ? "Transport" : "School"}
                      </Badge>
                    </td>
                    <td className="max-w-[220px] truncate text-slate-600" title={payment.description}>
                      {payment.description}
                    </td>
                    <td className="font-medium">{formatINR(payment.amountPaid)}</td>
                    <td className="capitalize">{payment.paymentMode.replace(/_/g, " ")}</td>
                    <td>
                      {payment.feeType === "transport" && payment.transportPaymentId ? (
                        <Link
                          href={`/receipt/${payment.transportPaymentId}`}
                          className="text-amber-600 hover:underline"
                          target="_blank"
                        >
                          Receipt
                        </Link>
                      ) : null}
                      {payment.feeType === "school" && payment.schoolReceiptNumber ? (
                        <Link
                          href={`/admin/school-fees/receipt/${payment.schoolReceiptNumber}`}
                          className="text-amber-600 hover:underline"
                          target="_blank"
                        >
                          Receipt
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination && (
          <ListPagination pagination={pagination} noun="payments" onPageChange={setPage} />
        )}
      </Card>
    </PageWrapper>
  );
};

const PaymentHistoryPage = (): JSX.Element => (
  <Suspense fallback={<p className="p-6 text-slate-500">Loading payment history...</p>}>
    <PaymentHistoryContent />
  </Suspense>
);

export default PaymentHistoryPage;
