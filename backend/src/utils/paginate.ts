import type { Model, PopulateOptions } from "mongoose";

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

export const parsePaginationQuery = (
  query: { page?: string | number; limit?: string | number },
  defaultLimit: number
): { page: number; limit: number } => ({
  page: Math.max(1, Number(query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(query.limit) || defaultLimit))
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const paginate = async (
  model: Model<any>,
  filter: object,
  options: {
    page: number;
    limit: number;
    sort?: Record<string, 1 | -1>;
    populate?: string | PopulateOptions | (string | PopulateOptions)[];
    select?: string;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<PaginatedResult<any>> => {
  const page = Math.max(1, options.page);
  const limit = Math.min(100, Math.max(1, options.limit));
  const skip = (page - 1) * limit;

  const query = model
    .find(filter)
    .sort(options.sort ?? { createdAt: -1 })
    .skip(skip)
    .limit(limit);

  if (options.populate) {
    query.populate(options.populate as PopulateOptions);
  }
  if (options.select) {
    query.select(options.select);
  }

  const [data, total] = await Promise.all([query.exec(), model.countDocuments(filter)]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
};

export const paginateArray = <T>(
  items: T[],
  page: number,
  limit: number
): PaginatedResult<T> => {
  const p = Math.max(1, page);
  const l = Math.min(100, Math.max(1, limit));
  const skip = (p - 1) * l;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / l));

  return {
    data: items.slice(skip, skip + l),
    pagination: {
      total,
      page: p,
      limit: l,
      totalPages,
      hasNext: p < totalPages,
      hasPrev: p > 1
    }
  };
};
