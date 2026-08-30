import { Types } from "mongoose";

import { Bus } from "../models/Bus";

export interface MonthlyBusReportRow {
  busId: Types.ObjectId;
  busNumber: string;
  routeName: string;
  totalFeesDue: number;
  totalFeesCollected: number;
  pendingCount: number;
  totalExpenses: number;
  netProfit: number;
  studentCount: number;
  transportStudentCount: number;
}

export interface MonthlyTrendPoint {
  month: string;
  totalFeesCollected: number;
  totalExpenses: number;
}

export const buildMonthlyBusReports = async (
  orgId: Types.ObjectId,
  monthKey: string,
  academicYear: string
): Promise<MonthlyBusReportRow[]> => {
  const start = new Date(`${monthKey}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  return Bus.aggregate<MonthlyBusReportRow>([
    { $match: { organizationId: orgId } },
    {
      $lookup: {
        from: "studenttransports",
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
          { $project: { _id: 1, monthlyTransportFee: 1 } }
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
        totalFeesDue: { $sum: "$students.monthlyTransportFee" },
        transportStudentCount: { $size: "$students" },
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
        studentCount: 1,
        transportStudentCount: 1
      }
    },
    { $sort: { busNumber: 1 } }
  ]);
};

export const buildMonthlyTrend = async (
  orgId: Types.ObjectId,
  monthKeys: string[],
  academicYear: string
): Promise<MonthlyTrendPoint[]> => {
  const uniqueMonths = [...new Set(monthKeys)];
  const points = await Promise.all(
    uniqueMonths.map(async (monthKey) => {
      const rows = await buildMonthlyBusReports(orgId, monthKey, academicYear);
      return {
        month: monthKey,
        totalFeesCollected: rows.reduce((sum, row) => sum + row.totalFeesCollected, 0),
        totalExpenses: rows.reduce((sum, row) => sum + row.totalExpenses, 0)
      };
    })
  );

  const order = new Map(uniqueMonths.map((month, index) => [month, index]));
  return points.sort((a, b) => (order.get(a.month) ?? 0) - (order.get(b.month) ?? 0));
};
