"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";

import { ListPagination } from "@/components/shared/ListPagination";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { ACADEMIC_YEAR } from "@/lib/constants";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { PaginatedResponse } from "@/types/pagination";
import type { SchoolFeePayment } from "@/types/schoolFees";

const HistoryPage = (): JSX.Element => {
  const params = useParams<{ studentId: string }>();
  const [page, setPage] = useState(1);

  const historyQuery = useQuery({
    queryKey: ["school-fee-history", params.studentId, { page, academicYear: ACADEMIC_YEAR }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<SchoolFeePayment>>(
          `/api/school-fees/history/${params.studentId}`,
          { params: { academicYear: ACADEMIC_YEAR, page, limit: 20 } }
        )
      ).data,
    placeholderData: keepPreviousData
  });

  const rows = historyQuery.data?.data ?? [];
  const pagination = historyQuery.data?.pagination;

  return (
    <PageWrapper title="Payment History">
      <Card>
        {historyQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <table className="w-full text-sm">
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
              {rows.map((p) => (
                <tr key={p._id} className="border-t border-slate-100">
                  <td className="p-2">
                    {new Date(p.paymentDate).toLocaleDateString("en-IN")}
                  </td>
                  <td>{p.receiptNumber}</td>
                  <td>{formatINR(p.totalAmountPaid)}</td>
                  <td className="capitalize">{p.paymentMode}</td>
                  <td>
                    <Link
                      href={`/admin/school-fees/receipt/${p.receiptNumber}`}
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
        )}
        {pagination && (
          <ListPagination pagination={pagination} noun="payments" onPageChange={setPage} />
        )}
      </Card>
    </PageWrapper>
  );
};

export default HistoryPage;
