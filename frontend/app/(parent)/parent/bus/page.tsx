"use client";

import { useQuery } from "@tanstack/react-query";
import { Bus, Navigation } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { Student } from "@/types";
import type { JSX } from "react";

const ParentBusPage = (): JSX.Element => {
  const childrenQuery = useQuery({
    queryKey: ["parent-children"],
    queryFn: async () =>
      (await api.get<{ data: Student[] }>("/api/parent/children")).data.data
  });

  const children = childrenQuery.data ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Bus</h1>
        <p className="mt-1 text-sm text-gray-500">Transport for your children</p>
      </div>

      {childrenQuery.isLoading ? (
        <p className="text-sm text-gray-500">Loading bus details…</p>
      ) : children.length === 0 ? (
        <Card className="rounded-2xl">
          <p className="text-sm text-gray-500">No children linked to this account.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {children.map((child) => {
            const bus = child.transport;
            return (
              <Card key={child._id} className="rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 text-base font-extrabold text-primary">
                    {child.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-gray-900">{child.name}</p>
                    <p className="text-sm text-gray-500">Grade {child.grade}</p>
                  </div>
                </div>

                {bus?.busNumber ? (
                  <div className="mt-4 space-y-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-sm font-semibold text-primary">
                      <Bus className="h-4 w-4" />
                      Bus {bus.busNumber}
                    </span>
                    {bus.routeName ? (
                      <p className="text-sm font-semibold text-gray-900">{bus.routeName}</p>
                    ) : null}
                    {(bus.pickupStop || bus.dropStop) && (
                      <p className="text-sm text-gray-500">
                        {[
                          bus.pickupStop ? `Pickup: ${bus.pickupStop}` : null,
                          bus.dropStop ? `Drop: ${bus.dropStop}` : null
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {typeof bus.monthlyTransportFee === "number" && bus.monthlyTransportFee > 0 ? (
                      <p className="text-sm text-gray-600">
                        Monthly fee{" "}
                        <span className="font-semibold text-gray-900">
                          {formatINR(bus.monthlyTransportFee)}
                        </span>
                      </p>
                    ) : null}
                    <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                      <Navigation className="h-4 w-4 text-gray-400" />
                      <span className="flex-1 text-sm text-gray-500">Live bus tracking</span>
                      <Badge status="pending">Coming soon</Badge>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-gray-500">
                    No bus assigned for this child.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ParentBusPage;
