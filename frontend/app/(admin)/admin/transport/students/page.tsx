"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { StudentTransportModal } from "@/components/admin/StudentTransportModal";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { TransportSubNav } from "@/components/layout/TransportSubNav";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { ACADEMIC_YEAR } from "@/lib/constants";
import { api } from "@/lib/api";
import type { Student, StudentTransportRecord } from "@/types";

const TransportStudentsPage = (): JSX.Element => {
  const [busId, setBusId] = useState("");
  const [search, setSearch] = useState("");
  const [modalStudent, setModalStudent] = useState<Student | null>(null);

  const transportsQuery = useQuery({
    queryKey: ["transport-list", busId, search],
    queryFn: async () =>
      (
        await api.get<{ data: StudentTransportRecord[] }>("/api/transport", {
          params: {
            busId: busId || undefined,
            status: "active",
            academicYear: ACADEMIC_YEAR,
            search: search || undefined
          }
        })
      ).data.data,
    placeholderData: keepPreviousData
  });

  const busesQuery = useQuery({
    queryKey: ["buses-compact"],
    queryFn: async () => (await api.get<{ data: { _id: string; busNumber: string }[] }>("/api/buses")).data.data
  });

  return (
    <PageWrapper title="Transport">
      <TransportSubNav />
      <Card>
        <div className="mb-3 grid gap-2 md:grid-cols-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student name"
            className="rounded border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={busId}
            onChange={(e) => setBusId(e.target.value)}
            className="rounded border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All buses</option>
            {(busesQuery.data ?? []).map((bus) => (
              <option key={bus._id} value={bus._id}>
                {bus.busNumber}
              </option>
            ))}
          </select>
        </div>
        {transportsQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th>Student</th>
                  <th>Grade</th>
                  <th>Bus</th>
                  <th>Stop</th>
                  <th>Fee / month</th>
                  <th>Since</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(transportsQuery.data ?? []).map((record) => {
                  const student =
                    typeof record.studentId === "string" ? null : record.studentId;
                  const bus =
                    typeof record.busId === "string" ? null : record.busId;
                  const studentForModal: Student | null = student
                    ? {
                        _id: student._id,
                        name: student.name,
                        grade: student.grade,
                        parentName: "",
                        parentPhone: student.parentPhone ?? "",
                        status: "active",
                        academicYear: record.academicYear
                      }
                    : null;
                  return (
                    <tr key={record._id} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{student?.name ?? "—"}</td>
                      <td>{student?.grade ?? "—"}</td>
                      <td>
                        {bus?.busNumber} ({bus?.routeName})
                      </td>
                      <td>{record.pickupStop ?? "—"}</td>
                      <td>₹{record.monthlyTransportFee.toLocaleString("en-IN")}</td>
                      <td>{new Date(record.effectiveFrom).toLocaleDateString("en-IN")}</td>
                      <td>
                        {studentForModal && (
                          <Button
                            variant="secondary"
                            onClick={() => setModalStudent(studentForModal)}
                          >
                            Manage
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-sm text-slate-600">
          To register transport for students not listed here, go to{" "}
          <Link href="/admin/students" className="text-amber-600 hover:underline">
            Students
          </Link>{" "}
          and use Manage Transport.
        </p>
      </Card>

      <StudentTransportModal
        student={modalStudent}
        isOpen={!!modalStudent}
        onClose={() => setModalStudent(null)}
      />
    </PageWrapper>
  );
};

export default TransportStudentsPage;
