import type { JSX } from "react";

import { cn } from "@/lib/utils";
import type { StudentTransportInfo } from "@/types";

type LiveState = NonNullable<StudentTransportInfo["liveState"]>;

const CHIP: Record<Exclude<LiveState, "no_tracker">, { label: string; dot: string; text: string }> = {
  live: { label: "Moving", dot: "bg-green-500", text: "text-green-700" },
  stopped: { label: "Stopped", dot: "bg-orange-500", text: "text-orange-700" },
  not_running: { label: "Not running", dot: "bg-gray-400", text: "text-gray-500" }
};

/** Tiny "● Moving" status for a child's bus. Shows nothing when the state is unknown. */
export const LiveStateChip = ({ state }: { state?: StudentTransportInfo["liveState"] }): JSX.Element | null => {
  if (!state || state === "no_tracker") {
    return null;
  }
  const chip = CHIP[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", chip.text)}>
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", chip.dot, state === "live" && "animate-pulse")} />
      {chip.label}
    </span>
  );
};
