import type { JSX, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SuperKpiStatCardProps {
  label: string;
  value: ReactNode;
  footnote: string;
  className?: string;
}

export const SuperKpiStatCard = ({
  label,
  value,
  footnote,
  className
}: SuperKpiStatCardProps): JSX.Element => (
  <div
    className={cn(
      "relative overflow-hidden rounded-md border border-gray-200 bg-white p-5 shadow-sm",
      className
    )}
  >
    <div
      className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-br from-[#FFEDD5]/80 via-[#FFF7ED]/40 to-transparent blur-2xl"
      aria-hidden
    />
    <p className="relative text-[13px] font-normal text-gray-500">{label}</p>
    <p className="relative mt-2 text-[26px] font-bold leading-none tracking-tight tabular-nums text-gray-900 md:text-[28px]">
      {value}
    </p>
    <p className="relative mt-3 text-[13px] text-gray-500">{footnote}</p>
  </div>
);
