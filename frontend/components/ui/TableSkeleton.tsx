import type { JSX } from "react";

interface TableSkeletonProps {
  rows?: number;
}

export const TableSkeleton = ({ rows = 6 }: TableSkeletonProps): JSX.Element => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="table-skeleton-row" />
    ))}
  </div>
);
