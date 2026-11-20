"use client";

import type { PaginationMeta } from "@/types/pagination";
import { paginationLabel } from "@/types/pagination";

import { Button } from "@/components/ui/Button";

type ListPaginationProps = {
  pagination: PaginationMeta;
  noun: string;
  onPageChange: (page: number) => void;
};

export const ListPagination = ({
  pagination,
  noun,
  onPageChange
}: ListPaginationProps): JSX.Element | null => {
  if (pagination.total === 0) {
    return null;
  }

  const hasPrev = pagination.hasPrev ?? pagination.page > 1;
  const hasNext = pagination.hasNext ?? pagination.page < pagination.totalPages;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
      <p className="text-sm text-slate-600">{paginationLabel(pagination, noun)}</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!hasPrev}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          Previous
        </Button>
        <span className="text-sm text-slate-600">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <Button
          type="button"
          variant="secondary"
          disabled={!hasNext}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
};
