import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import type { Pastel } from "@/lib/pastel";

/** Decorative blobs + large icon on the right of a pastel feature card (mobile PastelArt). */
export const PastelDecor = ({
  pastel,
  icon: Icon
}: {
  pastel: Pastel;
  icon: LucideIcon;
}): JSX.Element => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-[58%] overflow-hidden">
    <span
      className="absolute -right-6 -top-8 h-40 w-40 rounded-full opacity-90"
      style={{ backgroundColor: pastel.soft }}
    />
    <span
      className="absolute -bottom-10 right-8 h-32 w-32 rounded-full opacity-70"
      style={{ backgroundColor: pastel.soft }}
    />
    <span
      className="absolute right-4 top-6 h-16 w-28 -rotate-12 rounded-3xl opacity-40"
      style={{ backgroundColor: pastel.accent }}
    />
    <Icon
      className="absolute right-6 top-8 h-24 w-24 -rotate-[10deg] opacity-[0.22]"
      style={{ color: pastel.accent }}
      strokeWidth={1.25}
    />
  </div>
);
