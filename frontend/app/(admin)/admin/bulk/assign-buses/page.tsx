"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { Bus, Student } from "@/types";

const ACADEMIC_YEAR = "2025-26";

const AssignBusesPage = (): JSX.Element => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [gradeFilter, setGradeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [transportBusFilter, setTransportBusFilter] = useState("");
  const [selectedBusId, setSelectedBusId] = useState("");
  const [pickupStop, setPickupStop] = useState("");
  const [monthlyTransportFee, setMonthlyTransportFee] = useState(1500);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [shortcutGrade, setShortcutGrade] = useState("");
  const [shortcutBusId, setShortcutBusId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const busesQuery = useQuery({
    queryKey: ["bulk-assign-buses"],
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });
  const studentsQuery = useQuery({
    queryKey: ["bulk-assign-students", statusFilter],
    queryFn: async () =>
      (
        await api.get<{ data: Student[] }>("/api/students", {
          params: { status: statusFilter, withTransport: true, page: 1, limit: 100 }
        })
      ).data.data
  });

  const visibleStudents = useMemo(() => {
    return (studentsQuery.data ?? []).filter((student) => {
      if (gradeFilter && student.grade !== gradeFilter) return false;
      if (transportBusFilter) {
        const busId = student.transport?.busId;
        const id = typeof busId === "string" ? busId : undefined;
        if (id !== transportBusFilter) return false;
      }
      return true;
    });
  }, [studentsQuery.data, transportBusFilter, gradeFilter]);

  const selectedBus = useMemo(
    () => (busesQuery.data ?? []).find((bus) => bus._id === selectedBusId),
    [busesQuery.data, selectedBusId]
  );
  const selectedBusCurrentCount = selectedBus?.activeStudentCount ?? 0;

  const capacityExceeded = !!(
    selectedBus &&
    selectedBus.capacity > 0 &&
    selectedBusCurrentCount + selectedIds.length > selectedBus.capacity
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
          academicYear: ACADEMIC_YEAR,
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
    onError: () => showToast("error", "Failed to assign transport")
  });

  const assignGradeMutation = useMutation({
    mutationFn: async () =>
      api.post<{ data: { created: number; skipped: number } }>(
        "/api/bulk/students/assign-bus-by-grade",
        {
          grade: shortcutGrade,
          busId: shortcutBusId,
          academicYear: ACADEMIC_YEAR,
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
        `Registered ${res.data.data.created} students in grade ${shortcutGrade}${
          res.data.data.skipped ? `, ${res.data.data.skipped} skipped` : ""
        }`
      );
    },
    onError: () => showToast("error", "Failed to assign grade")
  });

  return (
    <PageWrapper title="Bulk Bus Assignment">
      <p className="mb-4 text-sm text-slate-600">
        Creates bus transport registrations (StudentTransport). Students without transport can be
        selected; those who already have active transport will be skipped.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Select Students">
          <div className="mb-3 grid gap-2 md:grid-cols-3">
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">All grades</option>
              {["Nursery", "KG1", "KG2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map(
                (g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                )
              )}
            </select>
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
                          Grade {student.grade} · Transport:{" "}
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
                Capacity: {selectedBusCurrentCount + selectedIds.length}/{selectedBus.capacity}
              </p>
              {capacityExceeded && (
                <p className="mt-1 font-semibold text-amber-700">
                  Capacity warning: this bus may exceed capacity.
                </p>
              )}
            </div>
          )}

          <Button
            className="mt-4"
            disabled={!selectedBusId || selectedIds.length === 0 || assignMutation.isPending}
            onClick={() => {
              if (!selectedBus) return;
              const confirmed = window.confirm(
                `Register ${selectedIds.length} students for ${selectedBus.busNumber} (${selectedBus.routeName})?`
              );
              if (confirmed) assignMutation.mutate();
            }}
          >
            {assignMutation.isPending ? "Registering..." : "Register for Bus"}
          </Button>

          <div className="mt-7 border-t border-slate-200 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Register entire grade</h3>
            <div className="grid gap-2 md:grid-cols-3">
              <select
                value={shortcutGrade}
                onChange={(e) => setShortcutGrade(e.target.value)}
                className="rounded border px-3 py-2 text-sm"
              >
                <option value="">Select grade</option>
                {["Nursery", "KG1", "KG2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map(
                  (g) => (
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  )
                )}
              </select>
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
                disabled={!shortcutGrade || !shortcutBusId || assignGradeMutation.isPending}
                onClick={() => {
                  const ok = window.confirm(
                    `Register all active students in Grade ${shortcutGrade} for selected bus?`
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
