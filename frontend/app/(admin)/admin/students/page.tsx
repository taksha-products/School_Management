"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronDown, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useAcademicYear } from "@/hooks/useAcademicYear";
import { ParentAccountCreatedModal } from "@/components/admin/ParentAccountCreatedModal";
import { StudentTransportModal } from "@/components/admin/StudentTransportModal";
import { ListPagination } from "@/components/shared/ListPagination";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { formatGradeDisplay, useOrgConfig } from "@/hooks/useOrgConfig";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/fileDownload";
import { formatINR } from "@/lib/utils";
import type { PaginatedResponse } from "@/types/pagination";
import type { FeePayment, ParentAccountProvision, Student } from "@/types";
import type { StudentFeeStatusMap } from "@/types/schoolFees";

const studentSchema = z.object({
  name: z.string().min(2),
  grade: z.string().min(1),
  section: z.string().optional(),
  parentName: z.string().min(2, "Parent name is required"),
  parentPhone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
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
  const { gradeOptions, getSectionsForGrade, hasAnySections } = useOrgConfig();
  const [open, setOpen] = useState(false);
  const [transportOpen, setTransportOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [transportStudent, setTransportStudent] = useState<Student | null>(null);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [parentAccountInfo, setParentAccountInfo] = useState<ParentAccountProvision | null>(null);
  const moreActionsRef = useRef<HTMLDivElement>(null);

  const showBulkSelect = statusFilter === "active";

  const sectionFilterOptions = useMemo(
    () => (gradeFilter ? getSectionsForGrade(gradeFilter) : []),
    [gradeFilter, getSectionsForGrade]
  );

  useEffect(() => {
    setSectionFilter("");
  }, [gradeFilter]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [search, gradeFilter, sectionFilter, statusFilter]);

  useEffect(() => {
    const onDoc = (event: MouseEvent): void => {
      if (moreActionsRef.current && !moreActionsRef.current.contains(event.target as Node)) {
        setMoreActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const form = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
    defaultValues: { status: "active", academicYear: orgAcademicYear }
  });

  const gradesQuery = useQuery({
    queryKey: ["student-grades"],
    queryFn: async () => (await api.get<{ data: string[] }>("/api/students/grades")).data.data
  });

  const studentsQuery = useQuery({
    queryKey: ["students", { page, search, grade: gradeFilter, section: sectionFilter, status: statusFilter }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<Student>>("/api/students", {
          params: {
            search: search || undefined,
            grade: gradeFilter || undefined,
            section: sectionFilter || undefined,
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
            params: { month, page: 1, limit: 100, academicYear: selectedStudent?.academicYear }
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

  const selectedGrade = form.watch("grade");
  const selectedGradeSections = getSectionsForGrade(selectedGrade);

  const mutation = useMutation({
    mutationFn: async (payload: StudentForm) => {
      const body = {
        ...payload,
        section:
          selectedGradeSections.length > 0 ? payload.section || undefined : undefined
      };
      if (editing) {
        return api.put<{ data: Student; parentAccount?: ParentAccountProvision; message?: string }>(
          `/api/students/${editing._id}`,
          body
        );
      }
      return api.post<{ data: Student; parentAccount?: ParentAccountProvision; message?: string }>(
        "/api/students",
        body
      );
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      setOpen(false);
      setEditing(null);
      form.reset();
      const parentAccount = response.data.parentAccount;
      if (parentAccount?.created && parentAccount.temporaryPassword) {
        setParentAccountInfo(parentAccount);
        showToast("success", "Student saved — parent account created");
      } else if (parentAccount && !parentAccount.created) {
        showToast("success", "Student saved and linked to existing parent");
      } else {
        showToast("success", "Student saved");
      }
    },
    onError: () => showToast("error", "Failed to save student")
  });

  const rows = useMemo(() => studentsQuery.data?.data ?? [], [studentsQuery.data]);
  const pagination = studentsQuery.data?.pagination;
  const visibleStudentIds = useMemo(
    () => rows.map((student) => student._id).sort().join(","),
    [rows]
  );

  const feeStatusQuery = useQuery({
    queryKey: ["students-fee-status", orgAcademicYear, visibleStudentIds],
    enabled: rows.length > 0,
    queryFn: async () => {
      const res = await api.get<{ data: StudentFeeStatusMap }>("/api/school-fees/student-fee-status", {
        params: {
          academicYear: orgAcademicYear,
          studentIds: rows.map((student) => student._id).join(",")
        }
      });
      return res.data.data;
    }
  });

  const feeStatusByStudent = feeStatusQuery.data ?? {};

  const allVisibleSelected =
    rows.length > 0 && rows.every((student) => selectedIds.includes(student._id));

  const toggleStudentSelection = (studentId: string): void => {
    setSelectedIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const toggleSelectAllVisible = (): void => {
    if (allVisibleSelected) {
      const visibleIds = new Set(rows.map((student) => student._id));
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.has(id)));
      return;
    }
    const merged = new Set([...selectedIds, ...rows.map((student) => student._id)]);
    setSelectedIds(Array.from(merged));
  };

  const bulkDeactivateMutation = useMutation({
    mutationFn: async (studentIds: string[]) =>
      (
        await api.post<{ data: { deactivated: number } }>("/api/students/bulk-deactivate", {
          studentIds
        })
      ).data,
    onSuccess: (res) => {
      const count = res.data.deactivated;
      void queryClient.invalidateQueries({ queryKey: ["students"] });
      setSelectedIds([]);
      setDeactivateConfirmOpen(false);
      showToast(
        "success",
        `${count} student${count === 1 ? "" : "s"} deactivated`
      );
    },
    onError: () => showToast("error", "Failed to deactivate students")
  });

  const handleExport = async (): Promise<void> => {
    try {
      setIsExporting(true);
      await downloadFromApi(
        "/api/bulk/export/students",
        `taksha_students_${new Date().toISOString().slice(0, 10)}.xlsx`,
        {
          grade: gradeFilter || undefined,
          section: sectionFilter || undefined,
          status: statusFilter || undefined
        }
      );
      showToast("success", "Students export downloaded");
    } catch {
      showToast("error", "Failed to export students");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <PageWrapper
      title="Students"
      action={
        <div className="flex flex-wrap gap-2">
          <div className="relative" ref={moreActionsRef}>
            <Button variant="secondary" onClick={() => setMoreActionsOpen((open) => !open)}>
              More actions
              <ChevronDown className="ml-1 inline h-4 w-4" />
            </Button>
            {moreActionsOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-md">
                <Link
                  href="/admin/bulk/grade-promotion"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setMoreActionsOpen(false)}
                >
                  Grade promotion
                </Link>
              </div>
            )}
          </div>
          <Button variant="secondary" onClick={handleExport} disabled={isExporting}>
            {isExporting ? "Exporting..." : "Export"}
          </Button>
          <Link href="/admin/bulk/upload-students">
            <Button variant="secondary">
              <Upload className="mr-1 inline h-4 w-4" />
              Import
            </Button>
          </Link>
          <Button
            onClick={() => {
              setEditing(null);
              form.reset({ status: "active", academicYear: orgAcademicYear });
              setOpen(true);
            }}
          >
            Add Student
          </Button>
        </div>
      }
    >
      <Card>
        <div className={`mb-3 grid gap-2 ${hasAnySections ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student name"
            className="rounded border border-slate-200 px-3 py-2"
          />
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="rounded border border-slate-200 px-3 py-2"
          >
            <option value="">All grades</option>
            {(gradesQuery.data ?? []).map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
          {hasAnySections && (
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              disabled={!gradeFilter || sectionFilterOptions.length === 0}
              className="rounded border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">
                {!gradeFilter
                  ? "Select grade first"
                  : sectionFilterOptions.length === 0
                    ? "No sections"
                    : "All sections"}
              </option>
              {sectionFilterOptions.map((section) => (
                <option key={section} value={section}>
                  Section {section}
                </option>
              ))}
            </select>
          )}
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
                  {showBulkSelect && (
                    <th className="w-10 py-2">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        aria-label="Select all students on this page"
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </th>
                  )}
                  <th>Name</th>
                  <th>Grade</th>
                  <th>Transport</th>
                  <th>Fees status</th>
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
                    {showBulkSelect && (
                      <td className="py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(student._id)}
                          onChange={() => toggleStudentSelection(student._id)}
                          aria-label={`Select ${student.name}`}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </td>
                    )}
                    <td className="py-2">{student.name}</td>
                    <td>{formatGradeDisplay(student.grade, student.section)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setTransportStudent(student);
                          setTransportOpen(true);
                        }}
                        className={
                          student.transport
                            ? "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-200"
                            : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                        }
                      >
                        {student.transport
                          ? `${student.transport.busNumber ?? "Bus"}${student.transport.pickupStop ? ` · ${student.transport.pickupStop}` : ""}`
                          : "No bus"}
                      </button>
                    </td>
                    <td>
                      {(() => {
                        const feeStatus = feeStatusByStudent[student._id];
                        if (!feeStatus?.assigned) {
                          return (
                            <span className="text-xs font-medium text-gray-500">Fees not assigned</span>
                          );
                        }
                        if (feeStatus.balance <= 0) {
                          return <Badge status="paid">Paid</Badge>;
                        }
                        return (
                          <Link
                            href={`/admin/fees/collect/${student._id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-medium text-rose-600 hover:underline"
                          >
                            {formatINR(feeStatus.balance)} due
                          </Link>
                        );
                      })()}
                    </td>
                    <td>{student.parentPhone}</td>
                    <td className="capitalize">{student.status}</td>
                    <td className="space-x-2">
                      <Button
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          setTransportStudent(student);
                          setTransportOpen(true);
                        }}
                      >
                        Transport
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(student);
                          form.reset({
                            name: student.name,
                            grade: student.grade,
                            section: student.section ?? "",
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

      {showBulkSelect && selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex w-[min(100%,36rem)] -translate-x-1/2 items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-lg">
          <p className="text-sm font-medium text-gray-900">
            {selectedIds.length} student{selectedIds.length === 1 ? "" : "s"} selected
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSelectedIds([])}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setDeactivateConfirmOpen(true)}>
              Deactivate Selected
            </Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={deactivateConfirmOpen}
        onClose={() => setDeactivateConfirmOpen(false)}
        title="Deactivate students"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeactivateConfirmOpen(false)}
              disabled={bulkDeactivateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => bulkDeactivateMutation.mutate(selectedIds)}
              disabled={bulkDeactivateMutation.isPending}
            >
              {bulkDeactivateMutation.isPending ? "Deactivating…" : "Confirm"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Deactivate {selectedIds.length} student{selectedIds.length === 1 ? "" : "s"}? They will
          be hidden from the active students list but their records will be preserved.
        </p>
      </Modal>

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
          <select {...form.register("grade")} className="rounded border px-3 py-2">
            <option value="">Select grade</option>
            {gradeOptions.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
          {selectedGradeSections.length > 0 && (
            <select {...form.register("section")} className="rounded border px-3 py-2">
              <option value="">Select section</option>
              {selectedGradeSections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          )}
          <div>
            <input
              {...form.register("parentName")}
              placeholder="Parent Name *"
              className="w-full rounded border px-3 py-2"
            />
            <p className="mt-1 text-xs text-rose-500">{form.formState.errors.parentName?.message}</p>
          </div>
          <div>
            <input
              {...form.register("parentPhone")}
              placeholder="Parent Phone * (10-digit)"
              className="w-full rounded border px-3 py-2"
            />
            <p className="mt-1 text-xs text-slate-500">
              Creates or links the parent login for mobile OTP / web access.
            </p>
            <p className="mt-1 text-xs text-rose-500">{form.formState.errors.parentPhone?.message}</p>
          </div>
          <textarea {...form.register("address")} placeholder="Address" className="rounded border px-3 py-2" />
          <input
            {...form.register("academicYear")}
            placeholder="Academic Year"
            className="rounded border px-3 py-2"
          />
          <select {...form.register("status")} className="rounded border px-3 py-2">
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
          <Button type="submit">Save Student</Button>
        </form>
      </Modal>

      <StudentTransportModal
        student={transportStudent}
        isOpen={transportOpen}
        onClose={() => {
          setTransportOpen(false);
          setTransportStudent(null);
        }}
      />

      <ParentAccountCreatedModal
        info={parentAccountInfo}
        onClose={() => setParentAccountInfo(null)}
      />
    </PageWrapper>
  );
};

export default StudentsPage;
