import type { JSX } from "react";

import type { ParentBusView } from "@/types/parentBus";

const Row = ({ label, value }: { label: string; value: string }): JSX.Element => (
  <div className="flex items-baseline justify-between gap-4 py-1.5">
    <dt className="shrink-0 text-sm text-gray-500">{label}</dt>
    <dd className="text-right text-sm font-medium text-gray-900">{value}</dd>
  </div>
);

/** The facts a parent looks up about the bus: their stop, the bus, the route, the driver. */
export const BusDetails = ({ view }: { view: ParentBusView }): JSX.Element | null => {
  if (!view.bus) {
    return null;
  }

  const stop = [
    view.stops?.pickup ? `Pickup: ${view.stops.pickup}` : null,
    view.stops?.drop && view.stops.drop !== view.stops.pickup ? `Drop: ${view.stops.drop}` : null
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <dl className="divide-y divide-gray-100">
      {stop && <Row label="Your stop" value={stop} />}
      <Row label="Bus" value={view.bus.busNumber} />
      <Row label="Route" value={view.bus.routeName} />
      {view.bus.driverName && <Row label="Driver" value={view.bus.driverName} />}
    </dl>
  );
};
