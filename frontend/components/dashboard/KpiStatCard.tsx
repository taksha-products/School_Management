import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { JSX, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface KpiStatCardProps {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  sub?: ReactNode;
  trend?: { value: number; label?: string };
  className?: string;
}

export const KpiStatCard = ({
  label,
  icon: Icon,
  value,
  sub,
  trend,
  className
}: KpiStatCardProps): JSX.Element => {
  const trendUp = (trend?.value ?? 0) >= 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-5 shadow-card",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50"
          aria-hidden
        >
          <Icon className="h-5 w-5 text-primary" strokeWidth={2} />
        </div>
        {trend !== undefined && (
          <div
            className={cn(
              "flex items-center gap-0.5 text-[13px] font-medium",
              trendUp ? "text-green-600" : "text-red-600"
            )}
          >
            {trendUp ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <p className="mt-4 text-[13px] font-normal text-gray-500">{label}</p>
      <div className="mt-1 text-[28px] font-semibold leading-tight tabular-nums text-gray-900">
        {value}
      </div>
      {sub && <div className="mt-1 text-[13px] text-gray-500">{sub}</div>}
      {trend?.label && (
        <p className="mt-1 text-[13px] text-gray-400">{trend.label}</p>
      )}
    </div>
  );
};

/** @deprecated Use KpiStatCard with icon prop */
export type KpiAccent = "blue" | "green" | "red" | "orange" | "purple";
