"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const Expense_1 = require("../models/Expense");
const asyncHandler_1 = require("../utils/asyncHandler");
const cache_1 = require("../utils/cache");
const orgFilter_1 = require("../utils/orgFilter");
const paginate_1 = require("../utils/paginate");
const expensesRouter = (0, express_1.Router)();
const scopeMiddleware = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, roleCheck_1.canAccessOrg];
const allowExpenseRead = (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isSuperAdminOrOrgStaffAny)("canViewReports")(req, res, next);
};
expensesRouter.get("/", ...scopeMiddleware, allowExpenseRead, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { busId, month, category, academicYear } = req.query;
    const filter = {
        ...(0, orgFilter_1.orgFilter)(authReq, res),
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
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 30);
    const { data, pagination } = await (0, paginate_1.paginate)(Expense_1.Expense, filter, {
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
}));
expensesRouter.post("/", ...scopeMiddleware, (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isOrgAdmin)(req, res, next);
}, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const payload = {
        ...req.body,
        organizationId: (0, orgFilter_1.getScopedOrganizationId)(authReq, res),
        addedBy: authReq.user?.userId
    };
    const expense = await Expense_1.Expense.create(payload);
    await (0, cache_1.invalidateOrgReportsCache)(String(payload.organizationId));
    res.status(201).json({ success: true, data: expense, message: "Expense created successfully" });
}));
expensesRouter.put("/:id", ...scopeMiddleware, (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isOrgAdmin)(req, res, next);
}, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const expense = await Expense_1.Expense.findOneAndUpdate({ _id: req.params.id, ...(0, orgFilter_1.orgFilter)(authReq, res), deleted: { $ne: true } }, req.body, { new: true, runValidators: true });
    if (!expense) {
        res.status(404).json({ success: false, data: null, message: "Expense not found" });
        return;
    }
    await (0, cache_1.invalidateOrgReportsCache)(String(expense.organizationId));
    res.json({ success: true, data: expense, message: "Expense updated successfully" });
}));
expensesRouter.delete("/:id", ...scopeMiddleware, (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isOrgAdmin)(req, res, next);
}, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const expense = await Expense_1.Expense.findOneAndUpdate({ _id: req.params.id, ...(0, orgFilter_1.orgFilter)(authReq, res) }, { deleted: true }, { new: true });
    if (!expense) {
        res.status(404).json({ success: false, data: null, message: "Expense not found" });
        return;
    }
    await (0, cache_1.invalidateOrgReportsCache)(String(expense.organizationId));
    res.json({ success: true, data: expense, message: "Expense deleted successfully" });
}));
exports.default = expensesRouter;
