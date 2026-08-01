import { Router } from "express";

import { auth } from "../../middleware/auth";
import { isSuperAdmin } from "../../middleware/roleCheck";
import { FeePayment } from "../../models/FeePayment";
import { Organization } from "../../models/Organization";
import { SchoolFeePayment } from "../../models/SchoolFeePayment";
import { Student } from "../../models/Student";
import { asyncHandler } from "../../utils/asyncHandler";

const dashboardRouter = Router();

interface MonthRange {
  start: Date;
  end: Date;
}

const getCurrentMonthRange = (): MonthRange => {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
  };
};

const sumAggregationTotal = (result: Array<{ total?: number }>): number =>
  result[0]?.total ?? 0;

dashboardRouter.get(
  "/",
  auth,
  isSuperAdmin,
  asyncHandler(async (_req, res) => {
    const { start, end } = getCurrentMonthRange();

    const [
      totalOrganizations,
      totalStudents,
      activePlans,
      transportRevenueAgg,
      schoolRevenueAgg,
      organizations
    ] = await Promise.all([
      Organization.countDocuments(),
      Student.countDocuments(),
      Organization.countDocuments({ isActive: true }),
      FeePayment.aggregate<{ total: number }>([
        {
          $match: {
            status: "paid",
            createdAt: { $gte: start, $lt: end }
          }
        },
        { $group: { _id: null, total: { $sum: "$amountPaid" } } }
      ]),
      SchoolFeePayment.aggregate<{ total: number }>([
        {
          $match: {
            paymentStatus: "completed",
            createdAt: { $gte: start, $lt: end }
          }
        },
        { $group: { _id: null, total: { $sum: "$totalAmountPaid" } } }
      ]),
      Organization.aggregate([
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

    const monthlyRevenue =
      sumAggregationTotal(transportRevenueAgg) + sumAggregationTotal(schoolRevenueAgg);

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
  })
);

export default dashboardRouter;
