"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { Bus } from "@/types";

const busSchema = z.object({
  busNumber: z.string().min(1),
  routeName: z.string().min(1),
  driverName: z.string().min(1),
  driverPhone: z.string().min(10),
  capacity: z.coerce.number().min(1),
  status: z.enum(["active", "inactive"])
});

type BusForm = z.infer<typeof busSchema>;

const BusesPage = (): JSX.Element => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const form = useForm<BusForm>({
    resolver: zodResolver(busSchema),
    defaultValues: { status: "active", capacity: 40 }
  });

  const busesQuery = useQuery({
    queryKey: ["buses"],
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });

  const mutation = useMutation({
    mutationFn: async (payload: BusForm) => {
      if (editingBus) {
        return api.put(`/api/buses/${editingBus._id}`, payload);
      }
      return api.post("/api/buses", payload);
    },
    onSuccess: () => {
      setOpen(false);
      setEditingBus(null);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["buses"] });
      showToast("success", "Bus saved");
    },
    onError: () => showToast("error", "Failed to save bus")
  });

  return (
    <PageWrapper
      title="Buses"
      action={
        <Button
          onClick={() => {
            setEditingBus(null);
            form.reset({ status: "active", capacity: 40 });
            setOpen(true);
          }}
        >
          Add Bus
        </Button>
      }
    >
      <Card>
        {busesQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th>Bus Number</th>
                  <th>Route</th>
                  <th>Driver</th>
                  <th>Capacity</th>
                  <th>Student Count</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(busesQuery.data ?? []).map((bus) => (
                  <tr key={bus._id} className="border-t border-slate-100">
                    <td className="py-2">{bus.busNumber}</td>
                    <td>{bus.routeName}</td>
                    <td>{bus.driverName}</td>
                    <td>{bus.capacity}</td>
                    <td>{bus.activeStudentCount ?? 0}</td>
                    <td className="capitalize">{bus.status}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditingBus(bus);
                          form.reset({
                            busNumber: bus.busNumber,
                            routeName: bus.routeName,
                            driverName: bus.driverName,
                            driverPhone: bus.driverPhone,
                            capacity: bus.capacity,
                            status: bus.status
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
          {Object.values(form.formState.errors).length > 0 && (
            <p className="text-xs text-rose-500">Please correct highlighted inputs.</p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            Save
          </Button>
        </form>
      </Modal>
    </PageWrapper>
  );
};

export default BusesPage;
