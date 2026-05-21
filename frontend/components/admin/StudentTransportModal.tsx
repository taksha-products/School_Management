"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { Bus, Student, StudentTransportRecord } from "@/types";

interface Props {
  student: Student | null;
  isOpen: boolean;
  onClose: () => void;
}

export const StudentTransportModal = ({ student, isOpen, onClose }: Props): JSX.Element | null => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [mode, setMode] = useState<"view" | "register" | "change">("view");
  const [busId, setBusId] = useState("");
  const [pickupStop, setPickupStop] = useState("");
  const [dropStop, setDropStop] = useState("");
  const [monthlyFee, setMonthlyFee] = useState(1500);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  const transportQuery = useQuery({
    queryKey: ["transport-student", student?._id],
    enabled: isOpen && !!student?._id,
    queryFn: async () =>
      (
        await api.get<{
          data: { current: StudentTransportRecord | null; history: StudentTransportRecord[] };
        }>(`/api/transport/student/${student!._id}`)
      ).data.data
  });

  const busesQuery = useQuery({
    queryKey: ["buses-compact"],
    enabled: isOpen,
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });

  useEffect(() => {
    if (!isOpen) {
      setMode("view");
      setBusId("");
      setPickupStop("");
      setDropStop("");
      setMonthlyFee(1500);
      setEffectiveFrom(new Date().toISOString().slice(0, 10));
    }
  }, [isOpen]);

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!student) return;
      return api.post("/api/transport", {
        studentId: student._id,
        busId,
        monthlyTransportFee: monthlyFee,
        pickupStop: pickupStop || undefined,
        dropStop: dropStop || undefined,
        effectiveFrom,
        academicYear: student.academicYear
      });
    },
    onSuccess: (res) => {
      const warning = (res?.data as { warning?: string })?.warning;
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["transport-student", student?._id] });
      queryClient.invalidateQueries({ queryKey: ["buses-compact"] });
      showToast("success", warning ?? "Transport registered");
      setMode("view");
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to register transport";
      showToast("error", message);
    }
  });

  const changeMutation = useMutation({
    mutationFn: async () => {
      const current = transportQuery.data?.current;
      if (!current || !student) return;
      return api.put(`/api/transport/${current._id}`, {
        busId,
        monthlyTransportFee: monthlyFee,
        pickupStop: pickupStop || undefined,
        dropStop: dropStop || undefined,
        effectiveFrom
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["transport-student", student?._id] });
      showToast("success", "Transport updated");
      setMode("view");
    },
    onError: () => showToast("error", "Failed to update transport")
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      const current = transportQuery.data?.current;
      if (!current) return;
      return api.put(`/api/transport/${current._id}/deactivate`, {
        effectiveTo: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["transport-student", student?._id] });
      showToast("success", "Student removed from bus");
      setMode("view");
    },
    onError: () => showToast("error", "Failed to remove transport")
  });

  if (!student) {
    return null;
  }

  const current = transportQuery.data?.current;
  const history = transportQuery.data?.history ?? [];
  const currentBus =
    current && typeof current.busId !== "string"
      ? current.busId
      : null;

  const transportForm = (
    <div className="grid gap-3">
      <select
        value={busId}
        onChange={(e) => setBusId(e.target.value)}
        className="rounded border border-slate-200 px-3 py-2"
      >
        <option value="">Select bus</option>
        {(busesQuery.data ?? []).map((bus) => (
          <option key={bus._id} value={bus._id}>
            {bus.busNumber} — {bus.routeName}
          </option>
        ))}
      </select>
      <input
        value={pickupStop}
        onChange={(e) => setPickupStop(e.target.value)}
        placeholder="Pickup stop"
        className="rounded border border-slate-200 px-3 py-2"
      />
      <input
        value={dropStop}
        onChange={(e) => setDropStop(e.target.value)}
        placeholder="Drop stop (optional)"
        className="rounded border border-slate-200 px-3 py-2"
      />
      <input
        type="number"
        value={monthlyFee}
        onChange={(e) => setMonthlyFee(Number(e.target.value))}
        placeholder="Monthly fee"
        className="rounded border border-slate-200 px-3 py-2"
      />
      <input
        type="date"
        value={effectiveFrom}
        onChange={(e) => setEffectiveFrom(e.target.value)}
        className="rounded border border-slate-200 px-3 py-2"
      />
      <div className="flex gap-2">
        <Button
          onClick={() => (mode === "register" ? registerMutation.mutate() : changeMutation.mutate())}
          disabled={!busId || registerMutation.isPending || changeMutation.isPending}
        >
          Save
        </Button>
        <Button variant="secondary" onClick={() => setMode("view")}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Transport — ${student.name}`}>
      {transportQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading transport details...</p>
      ) : current ? (
        mode === "view" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <p>
                <span className="font-medium">Bus:</span> {currentBus?.busNumber} ({currentBus?.routeName})
              </p>
              {current.pickupStop && (
                <p>
                  <span className="font-medium">Stop:</span> {current.pickupStop}
                </p>
              )}
              <p>
                <span className="font-medium">Fee:</span> ₹{current.monthlyTransportFee.toLocaleString("en-IN")}
                /month
              </p>
              <p>
                <span className="font-medium">Since:</span>{" "}
                {new Date(current.effectiveFrom).toLocaleDateString("en-IN")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setBusId(typeof current.busId === "string" ? current.busId : current.busId._id);
                  setPickupStop(current.pickupStop ?? "");
                  setDropStop(current.dropStop ?? "");
                  setMonthlyFee(current.monthlyTransportFee);
                  setMode("change");
                }}
              >
                Change Bus
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (
                    window.confirm(
                      `Student will be removed from ${currentBus?.busNumber} from today. Their pending fees for this month will remain.`
                    )
                  ) {
                    deactivateMutation.mutate();
                  }
                }}
              >
                Remove from Bus
              </Button>
            </div>
          </div>
        ) : (
          transportForm
        )
      ) : mode === "register" ? (
        transportForm
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">This student is not registered for bus transport.</p>
          <Button onClick={() => setMode("register")}>Register for Bus</Button>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Transport history</p>
          <ul className="space-y-2 text-sm text-slate-600">
            {history.map((record) => {
              const bus =
                typeof record.busId !== "string" ? record.busId : null;
              return (
                <li key={record._id} className="rounded border border-slate-100 px-3 py-2">
                  {bus?.busNumber} — ₹{record.monthlyTransportFee}/mo —{" "}
                  {new Date(record.effectiveFrom).toLocaleDateString("en-IN")}
                  {record.effectiveTo
                    ? ` to ${new Date(record.effectiveTo).toLocaleDateString("en-IN")}`
                    : record.status === "active"
                      ? " (current)"
                      : ""}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
};
