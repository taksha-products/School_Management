"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Bus } from "lucide-react";
import { useMemo, type JSX } from "react";

import { ParentBrandHeader } from "@/components/parent/ParentBrandHeader";
import { api } from "@/lib/api";
import { INK, pastelAt, SOFT_TEXT, TILE } from "@/lib/pastel";
import type { Student } from "@/types";

const liveStatus = (
  transport?: Student["transport"]
): { label: string; color: string } => {
  if (!transport?.busNumber) {
    return { label: "No bus", color: "#D4D4D8" };
  }
  switch (transport.liveState) {
    case "live":
      return { label: "Moving now", color: "#4CB963" };
    case "stopped":
      return { label: "Stopped", color: "#EA8A3B" };
    case "not_running":
      return { label: "Not running", color: "#A1A1AA" };
    default:
      return transport.trackingEnabled
        ? { label: "Track bus", color: "#4CB963" }
        : { label: "Tracking unavailable", color: "#A1A1AA" };
  }
};

interface BusGroup {
  busNumber: string;
  routeName?: string;
  children: Student[];
}

const ParentBusPage = (): JSX.Element => {
  const childrenQuery = useQuery({
    queryKey: ["parent-children"],
    queryFn: async () =>
      (await api.get<{ data: Student[] }>("/api/parent/children")).data.data
  });

  const children = childrenQuery.data ?? [];

  const buses = useMemo<BusGroup[]>(() => {
    const map = new Map<string, BusGroup>();
    for (const child of children) {
      const busNumber = child.transport?.busNumber;
      if (!busNumber) {
        continue;
      }
      const group = map.get(busNumber) ?? {
        busNumber,
        routeName: child.transport?.routeName,
        children: []
      };
      group.children.push(child);
      map.set(busNumber, group);
    }
    return [...map.values()];
  }, [children]);

  return (
    <div>
      <ParentBrandHeader title="Bus" tagline="Track your child's school bus" />

      {childrenQuery.isLoading ? (
        <p className="py-10 text-center text-sm text-[#71717A]">Loading bus details…</p>
      ) : children.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-[#71717A]">
          No children linked to this account.
        </p>
      ) : (
        <>
          {buses.length > 0 ? (
            <div className="mb-2 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {buses.map((bus) => {
                const status = liveStatus(bus.children[0]?.transport);
                const href = bus.children[0]?.transport?.trackingEnabled
                  ? `/parent/child/${bus.children[0]._id}/bus`
                  : `/parent/child/${bus.children[0]!._id}`;
                return (
                  <Link
                    key={bus.busNumber}
                    href={href}
                    className="relative h-[200px] w-[min(100%,340px)] shrink-0 snap-center overflow-hidden rounded-[22px] p-5 transition hover:opacity-95"
                    style={{ backgroundColor: TILE }}
                  >
                    <div className="relative z-10 max-w-[58%]">
                      <p className="text-[13px]" style={{ color: SOFT_TEXT }}>
                        Bus {bus.busNumber}
                      </p>
                      <p
                        className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight"
                        style={{ color: INK }}
                      >
                        {bus.routeName ?? "School route"}
                      </p>
                      <span
                        className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-white"
                        style={{ backgroundColor: status.color }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        {status.label}
                      </span>
                    </div>
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-6 -right-4 h-36 w-36 rounded-full bg-[#EBECEE]"
                    />
                    <Bus
                      aria-hidden="true"
                      className="absolute bottom-4 right-4 h-28 w-28 text-[#E2A93B]"
                      strokeWidth={1.25}
                    />
                  </Link>
                );
              })}
            </div>
          ) : null}

          <h2 className="mb-3 mt-6 text-[19px] font-bold" style={{ color: INK }}>
            Your children
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {children.map((child, index) => {
              const pastel = pastelAt(index);
              const bus = child.transport;
              const status = liveStatus(bus);
              const canTrack = Boolean(bus?.busNumber);
              const href = bus?.trackingEnabled
                ? `/parent/child/${child._id}/bus`
                : `/parent/child/${child._id}`;
              return (
                <Link
                  key={child._id}
                  href={canTrack ? href : `/parent/child/${child._id}`}
                  className={`relative flex flex-col items-center rounded-[18px] px-3 py-5 text-center transition ${
                    canTrack ? "hover:opacity-95" : "opacity-70"
                  }`}
                  style={{ backgroundColor: TILE }}
                >
                  <span className="relative">
                    <span
                      className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-extrabold"
                      style={{ backgroundColor: pastel.bg, color: pastel.accent }}
                    >
                      {child.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span
                      className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white"
                      style={{ backgroundColor: status.color }}
                    />
                  </span>
                  <p className="mt-3 w-full truncate text-base font-semibold" style={{ color: INK }}>
                    {child.name.split(" ")[0]}
                  </p>
                  <p className="mt-0.5 text-[13px]" style={{ color: SOFT_TEXT }}>
                    {bus?.busNumber ? `Bus ${bus.busNumber}` : "No bus"}
                  </p>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ParentBusPage;
