"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const roleCheck_1 = require("../../middleware/roleCheck");
const FeePayment_1 = require("../../models/FeePayment");
const Organization_1 = require("../../models/Organization");
const SchoolFeePayment_1 = require("../../models/SchoolFeePayment");
const Student_1 = require("../../models/Student");
const asyncHandler_1 = require("../../utils/asyncHandler");
const dashboardRouter = (0, express_1.Router)();
const getCurrentMonthRange = () => {
    const now = new Date();
    return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
    };
};
const sumAggregationTotal = (result) => result[0]?.total ?? 0;
dashboardRouter.get("/", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const { start, end } = getCurrentMonthRange();
    const [totalOrganizations, totalStudents, activePlans, transportRevenueAgg, schoolRevenueAgg, organizations] = await Promise.all([
        Organization_1.Organization.countDocuments(),
        Student_1.Student.countDocuments(),
        Organization_1.Organization.countDocuments({ isActive: true }),
        FeePayment_1.FeePayment.aggregate([
            {
                $match: {
                    status: "paid",
                    createdAt: { $gte: start, $lt: end }
                }
            },
            { $group: { _id: null, total: { $sum: "$amountPaid" } } }
        ]),
        SchoolFeePayment_1.SchoolFeePayment.aggregate([
            {
                $match: {
                    paymentStatus: "completed",
                    createdAt: { $gte: start, $lt: end }
                }
            },
            { $group: { _id: null, total: { $sum: "$totalAmountPaid" } } }
        ]),
        Organization_1.Organization.aggregate([
            {
                $lookup: {
                    from: "students",
                    localField: "_id",
                    foreignField: "organizationId",
                    as: "students"
                }
            },
            {
                $project: {
                    name: 1,
                    code: 1,
                    plan: 1,
                    isActive: 1,
                    studentCount: { $size: "$students" },
                    createdAt: 1
                }
            },
            { $sort: { name: 1 } },
            { $limit: 5 }
        ])
    ]);
    const monthlyRevenue = sumAggregationTotal(transportRevenueAgg) + sumAggregationTotal(schoolRevenueAgg);
    res.json({
        success: true,
        data: {
            stats: {
                totalOrganizations,
                totalStudents,
                activePlans,
                monthlyRevenue
            },
            organizations
        },
        message: "Super admin dashboard fetched successfully"
    });
}));
exports.default = dashboardRouter;
