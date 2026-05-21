import type { HTMLAttributes, JSX } from "react";

import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  compact?: boolean;
  flush?: boolean;
}

export const Card = ({
  children,
  className,
  title,
  compact,
  flush,
  ...props
}: CardProps): JSX.Element => (
  <div
    className={cn(
      "rounded-xl border border-gray-200 bg-white text-gray-900 shadow-card",
      flush ? "p-0" : compact ? "p-4" : "p-6",
      className
    )}
    {...props}
  >
    {title && (
      <h3 className="mb-4 text-[15px] font-semibold text-gray-900">{title}</h3>
    )}
    {children}
  </div>
);
