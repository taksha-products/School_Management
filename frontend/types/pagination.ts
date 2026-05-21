export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: PaginationMeta;
  message?: string;
}

export const paginationLabel = (
  pagination: PaginationMeta,
  noun: string
): string => {
  if (pagination.total === 0) {
    return `No ${noun} found`;
  }
  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);
  return `Showing ${start}–${end} of ${pagination.total} ${noun}`;
};
