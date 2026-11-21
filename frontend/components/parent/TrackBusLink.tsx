import Link from "next/link";
import type { JSX } from "react";

interface TrackBusLinkProps {
  studentId: string;
  busNumber?: string;
}

/** Entry point from a child's card to the live bus page. */
export const TrackBusLink = ({ studentId, busNumber }: TrackBusLinkProps): JSX.Element => (
  <Link
    href={`/parent/child/${studentId}/bus`}
    className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
  >
    <span>Track school bus{busNumber ? ` · ${busNumber}` : ""}</span>
    <span aria-hidden="true">→</span>
  </Link>
);
