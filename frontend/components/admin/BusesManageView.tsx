"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useState, type JSX } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { useFeatureEnabled } from "@/hooks/useOrgFeatures";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Bus, BusTracker, BusTrackerStatus, StudentTransportRecord } from "@/types";

/** Mirrors the API rule: 3-64 chars of letters, digits and . _ : - */
const TRACKER_ID_PATTERN = /^[A-Za-z0-9._:-]{3,64}$/;

const busSchema = z.object({
  busNumber: z.string().min(1),
  routeName: z.string().min(1),
  routeNumber: z.string().trim().max(20, "At most 20 characters").optional(),
  driverName: z.string().min(1),
  driverPhone: z.string().min(10),
  capacity: z.coerce.number().min(1),
  status: z.enum(["active", "inactive"]),
  trackerId: z
    .string()
    .trim()
    .refine((value) => value === "" || TRACKER_ID_PATTERN.test(value), {
      message: "Use 3-64 letters, digits, dots, dashes, colons or underscores"
    })
    .optional()
});

type BusForm = z.infer<typeof busSchema>;

interface ApiErrorBody {
  message?: string;
  errors?: Array<{ message?: string }>;
}

const extractErrorMessage = (error: unknown, fallback: string): string => {
  const body = (error as AxiosError<ApiErrorBody>).response?.data;
  return body?.errors?.[0]?.message ?? body?.message ?? fallback;
};

const TRACKER_LABELS: Record<BusTrackerStatus, { label: string; className: string }> = {
  none: { label: "No tracker", className: "bg-gray-100 text-gray-500" },
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700" },
  synced: { label: "Registered", className: "bg-green-100 text-green-700" },
  failed: { label: "Sync failed", className: "bg-red-100 text-red-700" },
  disabled: { label: "Disabled", className: "bg-gray-100 text-gray-500" }
};

const TrackerBadge = ({ tracker }: { tracker?: BusTracker }): JSX.Element => {
  const status = tracker?.status ?? "none";
  const { label, className } = TRACKER_LABELS[status];
  return (
    <div className="flex flex-col gap-0.5">
      <Badge className={cn("w-fit", className)} title={tracker?.error ?? undefined}>
        {label}
      </Badge>
      {tracker?.trackerId && (
        <span className="font-mono text-xs text-slate-500">{tracker.trackerId}</span>
      )}
    </div>
  );
};

export const BusesManageView = (): JSX.Element => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const gpsEnabled = useFeatureEnabled("gpsTracking");
  const [open, setOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [viewBus, setViewBus] = useState<Bus | null>(null);

  const busStudentsQuery = useQuery({
    queryKey: ["bus-students", viewBus?._id],
    enabled: !!viewBus,
    queryFn: async () =>
      (
        await api.get<{ data: StudentTransportRecord[] }>(
          `/api/transport/bus/${viewBus!._id}/students`
        )
      ).data.data
  });
  const form = useForm<BusForm>({
    resolver: zodResolver(busSchema),
    defaultValues: { status: "active", capacity: 40, trackerId: "" }
  });

  const busesQuery = useQuery({
    queryKey: ["buses"],
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });

  const mutation = useMutation({
    mutationFn: async (payload: BusForm) => {
      // Only send the tracker when GPS tracking is part of the organization's plan.
      const { trackerId, ...busFields } = payload;
      const body = gpsEnabled ? { ...busFields, trackerId: trackerId ?? "" } : busFields;
      if (editingBus) {
        return api.put<{ data: Bus }>(`/api/buses/${editingBus._id}`, body);
      }
      return api.post<{ data: Bus }>("/api/buses", body);
    },
    onSuccess: (response) => {
      setOpen(false);
      setEditingBus(null);
      form.reset({ status: "active", capacity: 40, trackerId: "" });
      queryClient.invalidateQueries({ queryKey: ["buses"] });
      queryClient.invalidateQueries({ queryKey: ["live-buses"] });

      const tracker = response.data.data?.tracker;
      if (tracker?.status === "failed") {
        showToast(
          "info",
          "Bus saved, but the GPS tracker could not be registered yet. Use Retry in the list."
        );
        return;
      }
      showToast("success", "Bus saved");
    },
    onError: (error) => showToast("error", extractErrorMessage(error, "Failed to save bus"))
  });

  const retryMutation = useMutation({
    mutationFn: async (busId: string) =>
      api.post<{ data: { tracker: BusTracker } }>(`/api/buses/${busId}/tracker/sync`),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["buses"] });
      const status = response.data.data.tracker.status;
      showToast(
        status === "synced" ? "success" : "error",
        status === "synced" ? "Tracker registered" : "Tracker sync failed again"
      );
    },
    onError: (error) => showToast("error", extractErrorMessage(error, "Could not retry sync"))
  });

  const addButton = (
    <Button
      onClick={() => {
        setEditingBus(null);
        form.reset({ status: "active", capacity: 40, trackerId: "" });
        setOpen(true);
      }}
    >
      Add Bus
    </Button>
  );

  return (
    <>
      <div className="mb-3 flex justify-end">{addButton}</div>
      <Card>
        {busesQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th>Bus Number</th>
                  <th>Route no.</th>
                  <th>Route</th>
                  <th>Driver</th>
                  <th>Capacity</th>
                  <th>Student Count</th>
                  <th>Status</th>
                  {gpsEnabled && <th>GPS tracker</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {(busesQuery.data ?? []).map((bus) => (
                  <tr key={bus._id} className="border-t border-slate-100">
                    <td className="py-2">{bus.busNumber}</td>
                    <td className="font-semibold">{bus.routeNumber || "—"}</td>
                    <td>{bus.routeName}</td>
                    <td>{bus.driverName}</td>
                    <td>{bus.capacity}</td>
                    <td>{bus.activeStudentCount ?? 0}</td>
                    <td className="capitalize">{bus.status}</td>
                    {gpsEnabled && (
                      <td>
                        <TrackerBadge tracker={bus.tracker} />
                      </td>
                    )}
                    <td className="space-x-2">
                      <Button variant="secondary" onClick={() => setViewBus(bus)}>
                        View Students
                      </Button>
                      {gpsEnabled &&
                        (bus.tracker?.status === "failed" || bus.tracker?.status === "pending") && (
                          <Button
                            variant="secondary"
                            disabled={retryMutation.isPending}
                            onClick={() => retryMutation.mutate(bus._id)}
                          >
                            Retry sync
                          </Button>
                        )}
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditingBus(bus);
                          form.reset({
                            busNumber: bus.busNumber,
                            routeName: bus.routeName,
                            routeNumber: bus.routeNumber ?? "",
                            driverName: bus.driverName,
                            driverPhone: bus.driverPhone,
                            capacity: bus.capacity,
                            status: bus.status,
                            trackerId: bus.tracker?.trackerId ?? ""
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
      </Card>

      <Modal
        isOpen={!!viewBus}
        onClose={() => setViewBus(null)}
        title={viewBus ? `Students on ${viewBus.busNumber}` : "Bus students"}
      >
        {busStudentsQuery.isLoading ? (
          <TableSkeleton rows={4} />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th>Name</th>
                <th>Grade</th>
                <th>Pickup Stop</th>
                <th>Monthly Fee</th>
                <th>Since</th>
              </tr>
            </thead>
            <tbody>
              {(busStudentsQuery.data ?? []).map((record) => {
                const student =
                  typeof record.studentId === "string" ? null : record.studentId;
                return (
                  <tr key={record._id} className="border-t border-slate-100">
                    <td className="py-2">{student?.name ?? "—"}</td>
                    <td>{student?.grade ?? "—"}</td>
                    <td>{record.pickupStop ?? "—"}</td>
                    <td>₹{record.monthlyTransportFee.toLocaleString("en-IN")}</td>
                    <td>{new Date(record.effectiveFrom).toLocaleDateString("en-IN")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Modal>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editingBus ? "Edit Bus" : "Add Bus"}>
        <form className="grid gap-3" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          {["busNumber", "routeName", "driverName", "driverPhone"].map((field) => (
            <input
              key={field}
              placeholder={field}
              {...form.register(field as keyof BusForm)}
              className="rounded border border-slate-200 px-3 py-2"
            />
          ))}
          <div className="grid gap-1">
            <label htmlFor="routeNumber" className="text-sm font-medium text-slate-700">
              Route number <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="routeNumber"
              placeholder="e.g. Route 5 or R5"
              autoComplete="off"
              {...form.register("routeNumber")}
              className="rounded border border-slate-200 px-3 py-2"
            />
            <p className="text-xs text-slate-500">
              Shown on the live map and to parents instead of the registration number.
            </p>
            {form.formState.errors.routeNumber && (
              <p className="text-xs text-rose-500">{form.formState.errors.routeNumber.message}</p>
            )}
          </div>
          <input
            type="number"
            placeholder="capacity"
            {...form.register("capacity")}
            className="rounded border border-slate-200 px-3 py-2"
          />
          <select {...form.register("status")} className="rounded border border-slate-200 px-3 py-2">
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>

          {gpsEnabled && (
            <div className="grid gap-1">
              <label htmlFor="trackerId" className="text-sm font-medium text-slate-700">
                GPS tracker ID <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="trackerId"
                placeholder="IMEI or device ID, e.g. 356938035643809"
                autoComplete="off"
                {...form.register("trackerId")}
                className="rounded border border-slate-200 px-3 py-2 font-mono text-sm"
              />
              <p className="text-xs text-slate-500">
                The tracker is registered automatically. Leave empty to remove it from this bus.
              </p>
              {form.formState.errors.trackerId && (
                <p className="text-xs text-rose-500">{form.formState.errors.trackerId.message}</p>
              )}
            </div>
          )}

          {Object.values(form.formState.errors).length > 0 && (
            <p className="text-xs text-rose-500">Please correct highlighted inputs.</p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            Save
          </Button>
        </form>
      </Modal>
    </>
  );
};
