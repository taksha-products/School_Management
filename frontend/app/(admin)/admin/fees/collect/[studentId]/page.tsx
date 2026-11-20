"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { SchoolFeesStudentCollectView } from "@/components/school-fees/SchoolFeesStudentCollectView";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAcademicYearState } from "@/hooks/useAcademicYear";
import { api } from "@/lib/api";
import type { Student } from "@/types";

const CollectStudentFeesPage = (): JSX.Element => {
  const params = useParams();
  const router = useRouter();
  const studentId = typeof params.studentId === "string" ? params.studentId : "";
  const [academicYear, setAcademicYear] = useAcademicYearState();
  const [lastReceiptNumber, setLastReceiptNumber] = useState<string | null>(null);

  const studentQuery = useQuery({
    queryKey: ["student", studentId],
    queryFn: async () =>
      (await api.get<{ data: Student }>(`/api/students/${studentId}`)).data.data,
    enabled: !!studentId,
    retry: false
  });

  const student = studentQuery.data;

  const headerAction = (
    <div className="flex flex-wrap gap-2">
      {lastReceiptNumber ? (
        <Link href={`/admin/school-fees/receipt/${lastReceiptNumber}`} target="_blank">
          <Button variant="secondary" size="sm">
            Print receipt
          </Button>
        </Link>
      ) : null}
      <Link href="/admin/fees/outstanding">
        <Button variant="secondary" size="sm">
          Back to list
        </Button>
      </Link>
    </div>
  );

  if (!studentId) {
    return (
      <PageWrapper title="Collect fees">
        <Card className="py-8 text-center text-sm text-slate-600">Invalid student link.</Card>
      </PageWrapper>
    );
  }

  if (studentQuery.isLoading) {
    return (
      <PageWrapper title="Collect fees">
        <p className="text-sm text-slate-500">Loading student...</p>
      </PageWrapper>
    );
  }

  if (studentQuery.isError || !student) {
    return (
      <PageWrapper title="Collect fees">
        <Card className="space-y-4 py-8 text-center">
          <p className="text-sm text-slate-600">Student not found or not in your organization.</p>
          <div>
            <Link href="/admin/fees/outstanding">
              <Button variant="secondary">← Back to Outstanding dues</Button>
            </Link>
          </div>
        </Card>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title={`Collect fees · ${student.name}`}
      action={headerAction}
    >
      <div className="mb-4">
        <button
          type="button"
          onClick={() => router.push("/admin/fees/outstanding")}
          className="text-sm font-medium text-amber-700 hover:underline"
        >
          ← Back to Outstanding dues
        </button>
      </div>

      <SchoolFeesStudentCollectView
        student={student}
        receiptBasePath="/admin/school-fees/receipt"
        historyPath={(id) => `/admin/fees/history?studentId=${id}`}
        academicYear={academicYear}
        onAcademicYearChange={setAcademicYear}
        onPaymentSuccess={setLastReceiptNumber}
      />

      {lastReceiptNumber ? (
        <Card className="mt-4 border-emerald-200 bg-emerald-50/50">
          <p className="text-sm text-emerald-900">
            Payment recorded.{" "}
            <Link
              href={`/admin/school-fees/receipt/${lastReceiptNumber}`}
              className="font-medium text-amber-700 hover:underline"
              target="_blank"
            >
              View receipt
            </Link>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setLastReceiptNumber(null)}>
              Collect more
            </Button>
            <Link href="/admin/fees/outstanding">
              <Button size="sm" variant="secondary">
                Back to outstanding list
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}
    </PageWrapper>
  );
};

export default CollectStudentFeesPage;
