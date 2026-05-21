"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginateArray = exports.paginate = exports.parsePaginationQuery = void 0;
const parsePaginationQuery = (query, defaultLimit) => ({
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(query.limit) || defaultLimit))
});
exports.parsePaginationQuery = parsePaginationQuery;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paginate = async (model, filter, options
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) => {
    const page = Math.max(1, options.page);
    const limit = Math.min(100, Math.max(1, options.limit));
    const skip = (page - 1) * limit;
    const query = model
        .find(filter)
        .sort(options.sort ?? { createdAt: -1 })
        .skip(skip)
        .limit(limit);
    if (options.populate) {
        query.populate(options.populate);
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
exports.paginate = paginate;
const paginateArray = (items, page, limit) => {
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
exports.paginateArray = paginateArray;
