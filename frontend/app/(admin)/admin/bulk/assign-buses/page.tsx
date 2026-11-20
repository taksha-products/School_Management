"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAcademicYear } from "@/hooks/useAcademicYear";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { formatGradeDisplay, useOrgConfig } from "@/hooks/useOrgConfig";
import type { Bus, Student } from "@/types";
import type { PaginatedResponse } from "@/types/pagination";


const fetchActiveStudentsForGrade = async (
  grade: string,
  section?: string
): Promise<Student[]> => {
  const collected: Student[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext && page <= 20) {
    const response = await api.get<PaginatedResponse<Student>>("/api/students", {
      params: {
        status: "active",
        withTransport: true,
        grade,
        section: section || undefined,
        page,
        limit: 100
      }
    });
    collected.push(...response.data.data);
    hasNext =
      response.data.pagination.hasNext ?? page < response.data.pagination.totalPages;
    page += 1;
  }

  return collected;
};

const AssignBusesPage = (): JSX.Element => {
  const orgAcademicYear = useAcademicYear();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { gradeOptions, getSectionsForGrade, hasAnySections } = useOrgConfig();
  const [gradeFilter, setGradeFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [transportBusFilter, setTransportBusFilter] = useState("");
  const [selectedBusId, setSelectedBusId] = useState("");
  const [pickupStop, setPickupStop] = useState("");
  const [monthlyTransportFee, setMonthlyTransportFee] = useState(1500);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [shortcutGrade, setShortcutGrade] = useState("");
  const [shortcutSection, setShortcutSection] = useState("");
  const [shortcutBusId, setShortcutBusId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const sectionOptions = useMemo(
    () => (gradeFilter ? getSectionsForGrade(gradeFilter) : []),
    [gradeFilter, getSectionsForGrade]
  );
  const shortcutSectionOptions = useMemo(
    () => (shortcutGrade ? getSectionsForGrade(shortcutGrade) : []),
    [shortcutGrade, getSectionsForGrade]
  );

  useEffect(() => {
    setSectionFilter("");
  }, [gradeFilter]);

  useEffect(() => {
    setShortcutSection("");
  }, [shortcutGrade]);

  const busesQuery = useQuery({
    queryKey: ["bulk-assign-buses"],
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });
  const studentsQuery = useQuery({
    queryKey: ["bulk-assign-students", statusFilter, gradeFilter, sectionFilter],
    queryFn: async () =>
      (
        await api.get<{ data: Student[] }>("/api/students", {
          params: {
            status: statusFilter,
            withTransport: true,
            page: 1,
            limit: 100,
            grade: gradeFilter || undefined,
            section: sectionFilter || undefined
          }
        })
      ).data.data
  });

  const visibleStudents = useMemo(() => {
    return (studentsQuery.data ?? []).filter((student) => {
      if (transportBusFilter) {
        const busId = student.transport?.busId;
        const id = typeof busId === "string" ? busId : undefined;
        if (id !== transportBusFilter) return false;
      }
      return true;
    });
  }, [studentsQuery.data, transportBusFilter]);

  const selectedBus = useMemo(
    () => (busesQuery.data ?? []).find((bus) => bus._id === selectedBusId),
    [busesQuery.data, selectedBusId]
  );
  const shortcutBus = useMemo(
    () => (busesQuery.data ?? []).find((bus) => bus._id === shortcutBusId),
    [busesQuery.data, shortcutBusId]
  );
  const selectedBusCurrentCount = selectedBus?.activeStudentCount ?? 0;

  const seatsToAssign = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return (studentsQuery.data ?? []).filter(
      (student) => selectedSet.has(student._id) && !student.transport
    ).length;
  }, [studentsQuery.data, selectedIds]);

  const capacityExceeded = !!(
    selectedBus &&
    selectedBus.capacity > 0 &&
    selectedBusCurrentCount + seatsToAssign > selectedBus.capacity
  );

  const gradeStudentsQuery = useQuery({
    queryKey: ["bulk-grade-transport-eligible", shortcutGrade, shortcutSection],
    enabled: Boolean(shortcutGrade),
    queryFn: () => fetchActiveStudentsForGrade(shortcutGrade, shortcutSection || undefined)
  });

  const gradeSeatsToAssign = useMemo(
    () => (gradeStudentsQuery.data ?? []).filter((student) => !student.transport).length,
    [gradeStudentsQuery.data]
  );

  const shortcutCapacityExceeded = !!(
    shortcutBus &&
    shortcutBus.capacity > 0 &&
    (shortcutBus.activeStudentCount ?? 0) + gradeSeatsToAssign > shortcutBus.capacity
  );

  const toggleStudent = (id: string): void => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const selectAllVisible = (checked: boolean): void => {
    if (!checked) {
      setSelectedIds((prev) => prev.filter((id) => !visibleStudents.some((s) => s._id === id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...visibleStudents.map((s) => s._id)])]);
  };

  const assignMutation = useMutation({
    mutationFn: async () =>
      api.post<{ data: { created: number; skipped: number; failed: number } }>(
        "/api/bulk/students/assign-bus",
        {
          studentIds: selectedIds,
          busId: selectedBusId,
          academicYear: orgAcademicYear,
          monthlyTransportFee,
          pickupStop: pickupStop || undefined,
          effectiveFrom
        }
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["bulk-assign-students"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["buses"] });
      setSelectedIds([]);
      showToast(
        "success",
        `Registered ${res.data.data.created} students for transport${
          res.data.data.skipped ? `, ${res.data.data.skipped} skipped` : ""
        }`
      );
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to assign transport";
      showToast("error", message);
    }
  });

  const assignGradeMutation = useMutation({
    mutationFn: async () =>
      api.post<{ data: { created: number; skipped: number } }>(
        "/api/bulk/students/assign-bus-by-grade",
        {
          grade: shortcutGrade,
          section: shortcutSection || undefined,
          busId: shortcutBusId,
          academicYear: orgAcademicYear,
          monthlyTransportFee,
          pickupStop: pickupStop || undefined,
          effectiveFrom
        }
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["bulk-assign-students"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      showToast(
        "success",
        `Registered ${res.data.data.created} students in ${formatGradeDisplay(shortcutGrade, shortcutSection || null)}${
          res.data.data.skipped ? `, ${res.data.data.skipped} skipped` : ""
        }`
      );
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to assign grade";
      showToast("error", message);
    }
  });

  return (
    <PageWrapper title="Bulk Bus Assignment">
      <p className="mb-4 text-sm text-slate-600">
        Creates bus transport registrations (StudentTransport). Students without transport can be
        selected; those who already have active transport will be skipped.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Select Students">
          <div className={`mb-3 grid gap-2 ${hasAnySections ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">All grades</option>
              {gradeOptions.map(
                (g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                )
              )}
            </select>
            {hasAnySections && (
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                disabled={!gradeFilter || sectionOptions.length === 0}
                className="rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">
                  {!gradeFilter
                    ? "Select grade first"
                    : sectionOptions.length === 0
                      ? "No sections"
                      : "All sections"}
                </option>
                {sectionOptions.map((section) => (
                  <option key={section} value={section}>
                    Section {section}
                  </option>
                ))}
              </select>
            )}
            <select
              value={transportBusFilter}
              onChange={(e) => setTransportBusFilter(e.target.value)}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">All transport status</option>
              <option value="none">No bus</option>
              {(busesQuery.data ?? []).map((bus) => (
                <option key={bus._id} value={bus._id}>
                  On {bus.busNumber}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <label className="mb-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={
                visibleStudents.length > 0 &&
                visibleStudents.every((s) => selectedIds.includes(s._id))
              }
              onChange={(e) => selectAllVisible(e.target.checked)}
            />
            Select all shown students
          </label>

          {studentsQuery.isLoading ? (
            <TableSkeleton rows={8} />
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
              <ul className="divide-y divide-slate-100">
                {visibleStudents
                  .filter((student) => {
                    if (transportBusFilter !== "none") return true;
                    return !student.transport;
                  })
                  .map((student) => (
                    <li key={student._id} className="flex items-start gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(student._id)}
                        onChange={() => toggleStudent(student._id)}
                      />
                      <div>
                        <p className="font-medium text-slate-800">{student.name}</p>
                        <p className="text-xs text-slate-600">
                          {formatGradeDisplay(student.grade, student.section)} · Transport:{" "}
                          {student.transport?.busNumber ?? "No bus"}
                        </p>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <p className="mt-3 text-sm font-semibold text-slate-700">{selectedIds.length} students selected</p>
        </Card>

        <Card title="Register for Bus Transport">
          <p className="mb-2 text-sm text-slate-600">Register selected students on:</p>
          <select
            value={selectedBusId}
            onChange={(e) => setSelectedBusId(e.target.value)}
            className="mb-2 w-full rounded border px-3 py-2 text-sm"
          >
            <option value="">Select bus</option>
            {(busesQuery.data ?? [])
              .filter((bus) => bus.status === "active")
              .map((bus) => (
                <option key={bus._id} value={bus._id}>
                  {bus.busNumber}
                </option>
              ))}
          </select>
          <input
            value={pickupStop}
            onChange={(e) => setPickupStop(e.target.value)}
            placeholder="Pickup stop (optional)"
            className="mb-2 w-full rounded border px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={monthlyTransportFee}
            onChange={(e) => setMonthlyTransportFee(Number(e.target.value))}
            placeholder="Monthly transport fee"
            className="mb-2 w-full rounded border px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="mb-2 w-full rounded border px-3 py-2 text-sm"
          />

          {selectedBus && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <p>Route: {selectedBus.routeName}</p>
              <p>Driver: {selectedBus.driverName}</p>
              <p>
                Capacity: {selectedBusCurrentCount + seatsToAssign}/{selectedBus.capacity}
                {seatsToAssign > 0 ? ` (${seatsToAssign} new seat${seatsToAssign === 1 ? "" : "s"})` : ""}
              </p>
              {capacityExceeded && (
                <p className="mt-1 font-semibold text-red-700">
                  Bus capacity exceeded. Reduce your selection or choose another bus.
                </p>
              )}
            </div>
          )}

          <Button
            className="mt-4"
            disabled={
              !selectedBusId ||
              seatsToAssign === 0 ||
              capacityExceeded ||
              assignMutation.isPending
            }
            onClick={() => {
              if (!selectedBus || capacityExceeded) return;
              const confirmed = window.confirm(
                `Register ${seatsToAssign} student${seatsToAssign === 1 ? "" : "s"} for ${selectedBus.busNumber} (${selectedBus.routeName})?`
              );
              if (confirmed) assignMutation.mutate();
            }}
          >
            {assignMutation.isPending ? "Registering..." : "Register for Bus"}
          </Button>

          <div className="mt-7 border-t border-slate-200 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Register entire grade</h3>
            {shortcutBus && shortcutGrade && (
              <p className="mb-2 text-sm text-slate-600">
                {gradeSeatsToAssign} student{gradeSeatsToAssign === 1 ? "" : "s"} without transport
                · Bus capacity: {(shortcutBus.activeStudentCount ?? 0) + gradeSeatsToAssign}/
                {shortcutBus.capacity}
              </p>
            )}
            {shortcutCapacityExceeded && (
              <p className="mb-2 text-sm font-semibold text-red-700">
                Bus capacity exceeded for this grade. Choose a larger bus or assign in smaller groups.
              </p>
            )}
            <div className={`grid gap-2 ${hasAnySections ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
              <select
                value={shortcutGrade}
                onChange={(e) => setShortcutGrade(e.target.value)}
                className="rounded border px-3 py-2 text-sm"
              >
                <option value="">Select grade</option>
                {gradeOptions.map(
                  (g) => (
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  )
                )}
              </select>
              {hasAnySections && (
                <select
                  value={shortcutSection}
                  onChange={(e) => setShortcutSection(e.target.value)}
                  disabled={!shortcutGrade || shortcutSectionOptions.length === 0}
                  className="rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {!shortcutGrade
                      ? "Select grade first"
                      : shortcutSectionOptions.length === 0
                        ? "No sections"
                        : "All sections"}
                  </option>
                  {shortcutSectionOptions.map((section) => (
                    <option key={section} value={section}>
                      Section {section}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={shortcutBusId}
                onChange={(e) => setShortcutBusId(e.target.value)}
                className="rounded border px-3 py-2 text-sm"
              >
                <option value="">Select bus</option>
                {(busesQuery.data ?? [])
                  .filter((bus) => bus.status === "active")
                  .map((bus) => (
                    <option key={bus._id} value={bus._id}>
                      {bus.busNumber}
                    </option>
                  ))}
              </select>
              <Button
                disabled={
                  !shortcutGrade ||
                  !shortcutBusId ||
                  gradeSeatsToAssign === 0 ||
                  shortcutCapacityExceeded ||
                  assignGradeMutation.isPending
                }
                onClick={() => {
                  const target = formatGradeDisplay(shortcutGrade, shortcutSection || null);
                  const ok = window.confirm(
                    `Register ${gradeSeatsToAssign} student${gradeSeatsToAssign === 1 ? "" : "s"} in ${target} for selected bus?`
                  );
                  if (ok) assignGradeMutation.mutate();
                }}
              >
                {assignGradeMutation.isPending ? "Registering..." : "Register Grade"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </PageWrapper>
  );
};

export default AssignBusesPage;
