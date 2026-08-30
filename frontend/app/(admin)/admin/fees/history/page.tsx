"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { StudentSearch } from "@/components/shared/StudentSearch";
import { ListPagination } from "@/components/shared/ListPagination";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { ACADEMIC_YEAR } from "@/lib/constants";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { Student } from "@/types";
import type { PaginatedResponse } from "@/types/pagination";
import type { SchoolFeePayment } from "@/types/schoolFees";

const PaymentHistoryContent = (): JSX.Element => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectId = searchParams.get("studentId");
  const [student, setStudent] = useState<Student | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!preselectId) return;
    api.get<{ data: Student }>(`/api/students/${preselectId}`).then((res) => {
      setStudent(res.data.data);
    });
  }, [preselectId]);

  useEffect(() => {
    setPage(1);
  }, [student?._id]);

  const historyQuery = useQuery({
    queryKey: ["school-fee-history", student?._id, { page, academicYear: ACADEMIC_YEAR }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<SchoolFeePayment>>(
          `/api/school-fees/history/${student!._id}`,
          { params: { academicYear: ACADEMIC_YEAR, page, limit: 20 } }
        )
      ).data,
    enabled: !!student?._id,
    placeholderData: keepPreviousData
  });

  const rows = historyQuery.data?.data ?? [];
  const pagination = historyQuery.data?.pagination;

  const handleSelectStudent = (selected: Student): void => {
    setStudent(selected);
    router.replace(`/admin/fees/history?studentId=${selected._id}`, { scroll: false });
  };

  return (
    <PageWrapper title="Payment History">
      <Card className="mb-4">
        <StudentSearch
          onSelect={handleSelectStudent}
          placeholder="Search student to view payment history..."
        />
        {student && (
          <p className="mt-2 text-sm text-slate-600">
            Showing payments for <span className="font-medium">{student.name}</span> (Grade{" "}
            {student.grade})
          </p>
        )}
      </Card>

      {!student ? (
        <Card>
          <p className="py-8 text-center text-sm text-slate-500">
            Search for a student above to view their payment history.
          </p>
        </Card>
      ) : (
        <Card>
          {historyQuery.isLoading ? (
            <TableSkeleton />
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="p-2">Date</th>
                    <th>Receipt</th>
                    <th>Amount</th>
                    <th>Mode</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((payment) => (
                    <tr key={payment._id} className="border-t border-slate-100">
                      <td className="p-2">
                        {new Date(payment.paymentDate).toLocaleDateString("en-IN")}
                      </td>
                      <td>{payment.receiptNumber}</td>
                      <td>{formatINR(payment.totalAmountPaid)}</td>
                      <td className="capitalize">{payment.paymentMode}</td>
                      <td>
                        <Link
                          href={`/admin/school-fees/receipt/${payment.receiptNumber}`}
                          className="text-amber-600 hover:underline"
                          target="_blank"
                        >
                          View Receipt
                        </Link>
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
      )}
    </PageWrapper>
  );
};

const PaymentHistoryPage = (): JSX.Element => (
  <Suspense fallback={<p className="p-6 text-slate-500">Loading payment history...</p>}>
    <PaymentHistoryContent />
  </Suspense>
);

export default PaymentHistoryPage;
