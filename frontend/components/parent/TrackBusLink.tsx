import { Navigation } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

/** Entry point from a child's card to the live bus page. */
export const TrackBusLink = ({ studentId }: { studentId: string }): JSX.Element => (
  <Link
    href={`/parent/child/${studentId}/bus`}
    className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-800 transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
  >
    <Navigation className="h-4 w-4" />
    Track bus live
  </Link>
);
