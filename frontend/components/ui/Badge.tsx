import type { HTMLAttributes, JSX } from "react";

import { cn } from "@/lib/utils";

type BadgeStatus =
  | "paid"
  | "partial"
  | "pending"
  | "overdue"
  | "active"
  | "inactive";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus;
}

const statusStyles: Record<BadgeStatus, string> = {
  paid: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  pending: "bg-gray-100 text-gray-500",
  overdue: "bg-red-100 text-red-700",
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-500"
};

const statusLabels: Record<BadgeStatus, string> = {
  paid: "Paid",
  partial: "Partial",
  pending: "Pending",
  overdue: "Overdue",
  active: "Active",
  inactive: "Inactive"
};

export const Badge = ({
  children,
  className,
  status,
  ...props
}: BadgeProps): JSX.Element => {
  const label = children ?? (status ? statusLabels[status] : null);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        status && statusStyles[status],
        !status && "bg-gray-100 text-gray-600",
        className
      )}
      {...props}
    >
      {label}
    </span>
  );
};
