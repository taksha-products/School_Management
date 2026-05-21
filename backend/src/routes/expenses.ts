import { Router } from "express";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import {
  canAccessOrg,
  isOrgAdmin,
  isSuperAdminOrOrgStaffAny
} from "../middleware/roleCheck";
import { Expense } from "../models/Expense";
import { asyncHandler } from "../utils/asyncHandler";
import { invalidateOrgReportsCache } from "../utils/cache";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";
import { paginate, parsePaginationQuery } from "../utils/paginate";

const expensesRouter = Router();

const scopeMiddleware = [auth, orgScope, requireOrgScope, canAccessOrg] as const;

const allowExpenseRead = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.role === "superAdmin") {
    next();
    return;
  }
  isSuperAdminOrOrgStaffAny("canViewReports")(req, res, next);
};

expensesRouter.get(
  "/",
  ...scopeMiddleware,
  allowExpenseRead,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { busId, month, category, academicYear } = req.query as {
      busId?: string;
      month?: string;
      category?: string;
      academicYear?: string;
    };

    const filter: Record<string, unknown> = {
      ...orgFilter(authReq, res),
      deleted: { $ne: true }
    };
    if (busId) {
      filter.busId = busId;
    }
    if (category) {
      filter.category = category;
    }
    if (academicYear) {
      filter.academicYear = academicYear;
    }
    if (month) {
      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      filter.date = { $gte: start, $lt: end };
    }

    const { page, limit } = parsePaginationQuery(req.query, 30);
    const { data, pagination } = await paginate(Expense, filter, {
      page,
      limit,
      sort: { date: -1 },
      populate: [
        { path: "busId", select: "busNumber routeName" },
        { path: "addedBy", select: "name role" }
      ]
    });

    res.json({
      success: true,
      data,
      pagination,
      message: "Expenses fetched successfully"
    });
  })
);

expensesRouter.post(
  "/",
  ...scopeMiddleware,
  (req, res, next) => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role === "superAdmin") {
      next();
      return;
    }
    isOrgAdmin(req, res, next);
  },
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const payload = {
      ...req.body,
      organizationId: getScopedOrganizationId(authReq, res),
      addedBy: authReq.user?.userId
    };
    const expense = await Expense.create(payload);
    invalidateOrgReportsCache(String(payload.organizationId));
    res.status(201).json({ success: true, data: expense, message: "Expense created successfully" });
  })
);

expensesRouter.put(
  "/:id",
  ...scopeMiddleware,
  (req, res, next) => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role === "superAdmin") {
      next();
      return;
    }
    isOrgAdmin(req, res, next);
  },
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, ...orgFilter(authReq, res), deleted: { $ne: true } },
      req.body,
      { new: true, runValidators: true }
    );
    if (!expense) {
      res.status(404).json({ success: false, data: null, message: "Expense not found" });
      return;
    }
    invalidateOrgReportsCache(String(expense.organizationId));
    res.json({ success: true, data: expense, message: "Expense updated successfully" });
  })
);

expensesRouter.delete(
  "/:id",
  ...scopeMiddleware,
  (req, res, next) => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role === "superAdmin") {
      next();
      return;
    }
    isOrgAdmin(req, res, next);
  },
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, ...orgFilter(authReq, res) },
      { deleted: true },
      { new: true }
    );
    if (!expense) {
      res.status(404).json({ success: false, data: null, message: "Expense not found" });
      return;
    }
    invalidateOrgReportsCache(String(expense.organizationId));
    res.json({ success: true, data: expense, message: "Expense deleted successfully" });
  })
);

export default expensesRouter;
