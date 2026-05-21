"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const auth_1 = require("../middleware/auth");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const Bus_1 = require("../models/Bus");
const asyncHandler_1 = require("../utils/asyncHandler");
const cache_1 = require("../utils/cache");
const orgFilter_1 = require("../utils/orgFilter");
const reportsRouter = (0, express_1.Router)();
const scopeMiddleware = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, roleCheck_1.canAccessOrg];
const allowReportRead = (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isSuperAdminOrOrgStaffAny)("canViewReports")(req, res, next);
};
reportsRouter.get("/monthly", ...scopeMiddleware, allowReportRead, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { month, year, academicYear } = req.query;
    const monthKey = month || year;
    if (!monthKey || !academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "month (or year as YYYY-MM) and academicYear are required"
        });
        return;
    }
    const orgIdStr = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const cacheKey = `${orgIdStr}:reports:monthly:${monthKey}`;
    const cached = (0, cache_1.cacheGet)(cacheKey);
    if (cached) {
        res.json({ success: true, data: cached, message: "Monthly report fetched successfully" });
        return;
    }
    const orgId = new mongoose_1.Types.ObjectId(orgIdStr);
    const start = new Date(`${monthKey}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const summary = await Bus_1.Bus.aggregate([
        { $match: { organizationId: orgId } },
        {
            $lookup: {
                from: "students",
                let: { busId: "$_id", orgId: "$organizationId" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$busId", "$$busId"] },
                                    { $eq: ["$organizationId", "$$orgId"] },
                                    { $eq: ["$status", "active"] },
                                    { $eq: ["$academicYear", academicYear] }
                                ]
                            }
                        }
                    },
                    { $project: { _id: 1, monthlyFee: 1 } }
                ],
                as: "students"
            }
        },
        {
            $lookup: {
                from: "feepayments",
                let: { busId: "$_id", orgId: "$organizationId" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$busId", "$$busId"] },
                                    { $eq: ["$organizationId", "$$orgId"] },
                                    { $eq: ["$month", monthKey] },
                                    { $eq: ["$academicYear", academicYear] }
                                ]
                            }
                        }
                    }
                ],
                as: "payments"
            }
        },
        {
            $lookup: {
                from: "expenses",
                let: { busId: "$_id", orgId: "$organizationId" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$busId", "$$busId"] },
                                    { $eq: ["$organizationId", "$$orgId"] },
                                    { $eq: ["$academicYear", academicYear] },
                                    { $gte: ["$date", start] },
                                    { $lt: ["$date", end] },
                                    { $ne: ["$deleted", true] }
                                ]
                            }
                        }
                    }
                ],
                as: "expenses"
            }
        },
        {
            $addFields: {
                totalFeesDue: { $sum: "$students.monthlyFee" },
                totalFeesCollected: {
                    $sum: {
                        $map: {
                            input: {
                                $filter: {
                                    input: "$payments",
                                    as: "payment",
                                    cond: { $in: ["$$payment.status", ["paid", "partial"]] }
                                }
                            },
                            as: "payment",
                            in: "$$payment.amountPaid"
                        }
                    }
                },
                pendingCount: {
                    $size: {
                        $filter: {
                            input: "$payments",
                            as: "payment",
                            cond: { $in: ["$$payment.status", ["pending", "overdue"]] }
                        }
                    }
                },
                totalExpenses: { $sum: "$expenses.amount" },
                studentCount: { $size: "$students" }
            }
        },
        {
            $project: {
                _id: 0,
                busId: "$_id",
                busNumber: 1,
                routeName: 1,
                totalFeesDue: 1,
                totalFeesCollected: 1,
                pendingCount: 1,
                totalExpenses: 1,
                netProfit: { $subtract: ["$totalFeesCollected", "$totalExpenses"] },
                studentCount: 1
            }
        },
        { $sort: { busNumber: 1 } }
    ]);
    (0, cache_1.cacheSet)(cacheKey, summary, 300);
    res.json({ success: true, data: summary, message: "Monthly report fetched successfully" });
}));
reportsRouter.get("/bus/:id", ...scopeMiddleware, allowReportRead, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { academicYear } = req.query;
    if (!academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "academicYear is required"
        });
        return;
    }
    const busIdParam = String(req.params.id);
    if (!mongoose_1.Types.ObjectId.isValid(busIdParam)) {
        res.status(400).json({ success: false, data: null, message: "Invalid bus id" });
        return;
    }
    const orgIdStr = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const cacheKey = `${orgIdStr}:reports:bus:${busIdParam}:${academicYear}`;
    const cached = (0, cache_1.cacheGet)(cacheKey);
    if (cached) {
        res.json({ success: true, data: cached, message: "Bus trend fetched successfully" });
        return;
    }
    const orgId = new mongoose_1.Types.ObjectId(orgIdStr);
    const busObjectId = new mongoose_1.Types.ObjectId(busIdParam);
    const [startYearText] = academicYear.split("-");
    const startYear = Number(startYearText);
    const months = [
        `${startYear}-04`,
        `${startYear}-05`,
        `${startYear}-06`,
        `${startYear}-07`,
        `${startYear}-08`,
        `${startYear}-09`,
        `${startYear}-10`,
        `${startYear}-11`,
        `${startYear}-12`,
        `${startYear + 1}-01`,
        `${startYear + 1}-02`,
        `${startYear + 1}-03`
    ];
    const trend = await Bus_1.Bus.aggregate([
        { $match: { _id: busObjectId, organizationId: orgId } },
        { $project: { monthList: months } },
        { $unwind: "$monthList" },
        {
            $lookup: {
                from: "feepayments",
                let: { month: "$monthList" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$busId", busObjectId] },
                                    { $eq: ["$organizationId", orgId] },
                                    { $eq: ["$month", "$$month"] },
                                    { $eq: ["$academicYear", academicYear] }
                                ]
                            }
                        }
                    }
                ],
                as: "payments"
            }
        },
        {
            $lookup: {
                from: "expenses",
                let: { month: "$monthList" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$busId", busObjectId] },
                                    { $eq: ["$organizationId", orgId] },
                                    { $eq: ["$academicYear", academicYear] },
                                    {
                                        $eq: [
                                            { $dateToString: { format: "%Y-%m", date: "$date" } },
                                            "$$month"
                                        ]
                                    },
                                    { $ne: ["$deleted", true] }
                                ]
                            }
                        }
                    }
                ],
                as: "expenses"
            }
        },
        {
            $project: {
                _id: 0,
                month: "$monthList",
                totalFeesCollected: {
                    $sum: {
                        $map: {
                            input: {
                                $filter: {
                                    input: "$payments",
                                    as: "payment",
                                    cond: { $in: ["$$payment.status", ["paid", "partial"]] }
                                }
                            },
                            as: "payment",
                            in: "$$payment.amountPaid"
                        }
                    }
                },
                totalExpenses: { $sum: "$expenses.amount" }
            }
        },
        {
            $addFields: {
                netProfit: { $subtract: ["$totalFeesCollected", "$totalExpenses"] }
            }
        }
    ]);
    (0, cache_1.cacheSet)(cacheKey, trend, 600);
    res.json({ success: true, data: trend, message: "Bus trend fetched successfully" });
}));
reportsRouter.get("/summary", ...scopeMiddleware, allowReportRead, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { month, academicYear } = req.query;
    if (!month || !academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "month and academicYear are required"
        });
        return;
    }
    const orgIdStr = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const cacheKey = `${orgIdStr}:reports:summary:${month}`;
    const cached = (0, cache_1.cacheGet)(cacheKey);
    if (cached) {
        res.json({
            success: true,
            data: cached,
            message: "Summary report fetched successfully"
        });
        return;
    }
    const orgId = new mongoose_1.Types.ObjectId(orgIdStr);
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const [summary] = await Bus_1.Bus.aggregate([
        { $match: { organizationId: orgId } },
        {
            $facet: {
                studentMetrics: [
                    {
                        $lookup: {
                            from: "students",
                            let: { busId: "$_id", orgId: "$organizationId" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ["$busId", "$$busId"] },
                                                { $eq: ["$organizationId", "$$orgId"] },
                                                { $eq: ["$status", "active"] },
                                                { $eq: ["$academicYear", academicYear] }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: "students"
                        }
                    },
                    { $project: { studentCount: { $size: "$students" } } },
                    {
                        $group: {
                            _id: null,
                            totalStudents: { $sum: "$studentCount" },
                            busCount: { $sum: 1 }
                        }
                    }
                ],
                feeMetrics: [
                    {
                        $lookup: {
                            from: "feepayments",
                            let: { busId: "$_id", orgId: "$organizationId" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ["$busId", "$$busId"] },
                                                { $eq: ["$organizationId", "$$orgId"] },
                                                { $eq: ["$month", month] },
                                                { $eq: ["$academicYear", academicYear] },
                                                { $in: ["$status", ["paid", "partial"]] }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: "payments"
                        }
                    },
                    { $project: { collected: { $sum: "$payments.amountPaid" } } },
                    { $group: { _id: null, totalFeesCollected: { $sum: "$collected" } } }
                ],
                expenseMetrics: [
                    {
                        $lookup: {
                            from: "expenses",
                            let: { busId: "$_id", orgId: "$organizationId" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ["$busId", "$$busId"] },
                                                { $eq: ["$organizationId", "$$orgId"] },
                                                { $eq: ["$academicYear", academicYear] },
                                                { $gte: ["$date", start] },
                                                { $lt: ["$date", end] },
                                                { $ne: ["$deleted", true] }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: "expenses"
                        }
                    },
                    { $project: { amount: { $sum: "$expenses.amount" } } },
                    { $group: { _id: null, totalExpenses: { $sum: "$amount" } } }
                ]
            }
        },
        {
            $project: {
                totalStudents: {
                    $ifNull: [{ $arrayElemAt: ["$studentMetrics.totalStudents", 0] }, 0]
                },
                busCount: { $ifNull: [{ $arrayElemAt: ["$studentMetrics.busCount", 0] }, 0] },
                totalFeesCollected: {
                    $ifNull: [{ $arrayElemAt: ["$feeMetrics.totalFeesCollected", 0] }, 0]
                },
                totalExpenses: {
                    $ifNull: [{ $arrayElemAt: ["$expenseMetrics.totalExpenses", 0] }, 0]
                }
            }
        },
        {
            $addFields: {
                netProfit: { $subtract: ["$totalFeesCollected", "$totalExpenses"] }
            }
        }
    ]);
    const data = summary ?? {
        totalStudents: 0,
        totalFeesCollected: 0,
        totalExpenses: 0,
        netProfit: 0,
        busCount: 0
    };
    (0, cache_1.cacheSet)(cacheKey, data, 300);
    res.json({
        success: true,
        data,
        message: "Summary report fetched successfully"
    });
}));
exports.default = reportsRouter;
