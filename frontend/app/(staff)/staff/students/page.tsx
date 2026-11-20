"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useAcademicYear } from "@/hooks/useAcademicYear";
import { ListPagination } from "@/components/shared/ListPagination";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { PaginatedResponse } from "@/types/pagination";
import type { Bus, FeePayment, Student } from "@/types";

const studentSchema = z.object({
  name: z.string().min(2),
  grade: z.string().min(1),
  parentName: z.string().min(2),
  parentPhone: z.string().min(10),
  address: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  academicYear: z.string().min(4)
});

type StudentForm = z.infer<typeof studentSchema>;
const recentMonths = Array.from({ length: 6 }).map((_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - i);
  return d.toISOString().slice(0, 7);
});

const StudentsPage = (): JSX.Element => {
  const orgAcademicYear = useAcademicYear();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [search, setSearch] = useState("");
  const [busFilter, setBusFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, busFilter, statusFilter]);

  const form = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
    defaultValues: { status: "active", academicYear: orgAcademicYear }
  });

  const busesQuery = useQuery({
    queryKey: ["buses-compact"],
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });

  const studentsQuery = useQuery({
    queryKey: ["students", { page, search, busId: busFilter, status: statusFilter }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<Student>>("/api/students", {
          params: {
            search: search || undefined,
            busId: busFilter || undefined,
            status: statusFilter || undefined,
            withTransport: true,
            page,
            limit: 50
          }
        })
      ).data,
    placeholderData: keepPreviousData
  });

  const historyQuery = useQuery({
    queryKey: ["student-history", selectedStudent?._id],
    enabled: !!selectedStudent,
    queryFn: async () => {
      const responses = await Promise.all(
        recentMonths.map((month) =>
          api.get<{ data: FeePayment[] }>("/api/fees", {
            params: { month, page: 1, limit: 100 }
          })
        )
      );
      return responses
        .flatMap((res) => res.data.data)
        .filter((payment) => {
          const id =
            typeof payment.studentId === "string" ? payment.studentId : payment.studentId._id;
          return id === selectedStudent?._id;
        })
        .slice(0, 6);
    }
  });

  const mutation = useMutation({
    mutationFn: async (payload: StudentForm) => {
      if (editing) {
        return api.put(`/api/students/${editing._id}`, payload);
      }
      return api.post("/api/students", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      setOpen(false);
      setEditing(null);
      form.reset();
      showToast("success", "Student saved");
    },
    onError: () => showToast("error", "Failed to save student")
  });

  const rows = useMemo(() => studentsQuery.data?.data ?? [], [studentsQuery.data]);
  const pagination = studentsQuery.data?.pagination;

  return (
    <PageWrapper
      title="Students"
      action={
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add Student
        </Button>
      }
    >
      <Card>
        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student name"
            className="rounded border border-slate-200 px-3 py-2"
          />
          <select
            value={busFilter}
            onChange={(e) => setBusFilter(e.target.value)}
            className="rounded border border-slate-200 px-3 py-2"
          >
            <option value="">All buses</option>
            {(busesQuery.data ?? []).map((bus) => (
              <option key={bus._id} value={bus._id}>
                {bus.busNumber}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-slate-200 px-3 py-2"
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>

        {studentsQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th>Name</th>
                <th>Grade</th>
                <th>Transport</th>
                <th>Parent Contact</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((student) => (
                <tr
                  key={student._id}
                  className="cursor-pointer border-t border-slate-100"
                  onClick={() => setSelectedStudent(student)}
                >
                  <td className="py-2">{student.name}</td>
                  <td>{student.grade}</td>
                  <td>
                    {student.transport ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        {student.transport.busNumber ?? "Bus"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        No Bus
                      </span>
                    )}
                  </td>
                  <td>{student.parentPhone}</td>
                  <td className="capitalize">{student.status}</td>
                  <td>
                    <Button
                      variant="secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditing(student);
                        form.reset({
                          name: student.name,
                          grade: student.grade,
                          parentName: student.parentName,
                          parentPhone: student.parentPhone,
                          address: student.address ?? "",
                          status: student.status,
                          academicYear: student.academicYear
                        });
                        setOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {pagination && (
          <ListPagination pagination={pagination} noun="students" onPageChange={setPage} />
        )}
      </Card>

      {selectedStudent && (
        <Card title={`Fee history - ${selectedStudent.name}`}>
          {historyQuery.isLoading ? (
            <TableSkeleton rows={4} />
          ) : (
            <div className="grid gap-2 md:grid-cols-3">
              {(historyQuery.data ?? []).map((item) => (
                <div key={item._id} className="rounded border border-slate-200 px-3 py-2 text-sm">
                  <p className="font-semibold">{item.month}</p>
                  <p>Status: {item.status}</p>
                  <p>Paid: Rs {item.amountPaid}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? "Edit Student" : "Add Student"}>
        <form className="grid gap-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <input {...form.register("name")} placeholder="Name" className="rounded border px-3 py-2" />
          <p className="text-xs text-rose-500">{form.formState.errors.name?.message}</p>
          <input {...form.register("grade")} placeholder="Grade" className="rounded border px-3 py-2" />
          <p className="text-xs text-rose-500">{form.formState.errors.grade?.message}</p>
          <input
            {...form.register("parentName")}
            placeholder="Parent Name"
            className="rounded border px-3 py-2"
          />
          <p className="text-xs text-rose-500">{form.formState.errors.parentName?.message}</p>
          <input
            {...form.register("parentPhone")}
            placeholder="Parent Phone"
            className="rounded border px-3 py-2"
          />
          <p className="text-xs text-rose-500">{form.formState.errors.parentPhone?.message}</p>
          <textarea {...form.register("address")} placeholder="Address" className="rounded border px-3 py-2" />
          <input
            {...form.register("academicYear")}
            placeholder="Academic Year"
            className="rounded border px-3 py-2"
          />
          <p className="text-xs text-rose-500">{form.formState.errors.academicYear?.message}</p>
          <Button type="submit">Save Student</Button>
        </form>
      </Modal>
    </PageWrapper>
  );
};

export default StudentsPage;
