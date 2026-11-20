"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { JSX } from "react";

import { cn } from "@/lib/utils";
import type { PaginationMeta } from "@/types/pagination";
import { paginationLabel } from "@/types/pagination";

interface SuperAdminListPaginationProps {
  pagination: PaginationMeta;
  noun: string;
  onPageChange: (page: number) => void;
}

export const SuperAdminListPagination = ({
  pagination,
  noun,
  onPageChange
}: SuperAdminListPaginationProps): JSX.Element | null => {
  if (pagination.total === 0) {
    return null;
  }

  const { page, totalPages } = pagination;
  const pageNumbers =
    totalPages <= 7
      ? Array.from({ length: totalPages }, (_, index) => index + 1)
      : [page];

  return (
    <div className="mt-4 flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gray-500">{paginationLabel(pagination, noun)}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous page"
          disabled={!pagination.hasPrev}
          onClick={() => onPageChange(page - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {totalPages > 7 ? (
          <span className="min-w-[5rem] text-center text-sm font-medium text-gray-700">
            {page} / {totalPages}
          </span>
        ) : (
          pageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              aria-label={`Page ${pageNumber}`}
              aria-current={pageNumber === page ? "page" : undefined}
              onClick={() => onPageChange(pageNumber)}
              className={cn(
                "flex h-9 min-w-[36px] items-center justify-center rounded-md px-2 text-sm font-medium transition",
                pageNumber === page
                  ? "bg-primary text-white shadow-sm"
                  : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              )}
            >
              {pageNumber}
            </button>
          ))
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={!pagination.hasNext}
          onClick={() => onPageChange(page + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
