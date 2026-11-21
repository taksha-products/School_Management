import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { ChildBusSwitcher } from "@/components/parent/ChildBusSwitcher";
import { cn } from "@/lib/utils";

interface BusPageControlsProps {
  currentStudentId: string;
  /** On top of the map (white chips with shadow) rather than on the page background. */
  floating?: boolean;
}

/** Back button and child switcher; the only controls above the bus. */
export const BusPageControls = ({
  currentStudentId,
  floating = false
}: BusPageControlsProps): JSX.Element => (
  <div className={cn("flex items-center gap-2", !floating && "flex-wrap")}>
    <Link
      href="/parent/dashboard"
      aria-label="Back to your children"
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 transition hover:border-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
        floating && "shadow-md"
      )}
    >
      <ArrowLeft aria-hidden="true" className="h-5 w-5" />
    </Link>
    <ChildBusSwitcher currentStudentId={currentStudentId} floating={floating} />
  </div>
);
