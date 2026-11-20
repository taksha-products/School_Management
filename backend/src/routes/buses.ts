import { Router } from "express";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import {
  canAccessOrg,
  isOrgAdminOrStaffAny,
  isSuperAdminOrOrgStaff
} from "../middleware/roleCheck";
import { Bus } from "../models/Bus";
import { asyncHandler } from "../utils/asyncHandler";
import { validate } from "../middleware/validate";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";
import { createBusValidation } from "../validators/buses";

const busesRouter = Router();

const scopeMiddleware = [auth, orgScope, requireOrgScope, canAccessOrg] as const;

busesRouter.get(
  "/",
  ...scopeMiddleware,
  (req, res, next) => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role === "superAdmin") {
      next();
      return;
    }
    isOrgAdminOrStaffAny("canManageBuses", "canViewReports")(req, res, next);
  },
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = new Types.ObjectId(getScopedOrganizationId(authReq, res)!);

    const buses = await Bus.aggregate([
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
                    { $eq: ["$status", "active"] }
                  ]
                }
              }
            }
          ],
          as: "activeStudents"
        }
      },
      {
        $project: {
          organizationId: 1,
          busNumber: 1,
          routeName: 1,
          driverName: 1,
          driverPhone: 1,
          capacity: 1,
          status: 1,
          activeStudentCount: { $size: "$activeStudents" },
          createdAt: 1,
          updatedAt: 1
        }
      },
      { $sort: { busNumber: 1 } }
    ]);

    res.json({ success: true, data: buses, message: "Buses fetched successfully" });
  })
);

busesRouter.get(
  "/:id",
  ...scopeMiddleware,
  (req, res, next) => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role === "superAdmin") {
      next();
      return;
    }
    isOrgAdminOrStaffAny("canManageBuses", "canViewReports")(req, res, next);
  },
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const bus = await Bus.findOne({ _id: req.params.id, ...orgFilter(authReq, res) });
    if (!bus) {
      res.status(404).json({ success: false, data: null, message: "Bus not found" });
      return;
    }
    res.json({ success: true, data: bus, message: "Bus fetched successfully" });
  })
);

busesRouter.post(
  "/",
  ...scopeMiddleware,
  isSuperAdminOrOrgStaff("canManageBuses"),
  createBusValidation,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res);
    if (!orgId) {
      res.status(403).json({
        success: false,
        data: null,
        message: "Forbidden: organization scope is required"
      });
      return;
    }

    const busNumber = String(req.body.busNumber ?? "").trim();
    const duplicate = await Bus.findOne({
      organizationId: new Types.ObjectId(orgId),
      busNumber
    }).select("_id");

    if (duplicate) {
      res.status(400).json({
        success: false,
        data: null,
        message: "A bus with this number already exists in your organization."
      });
      return;
    }

    const bus = await Bus.create({
      ...req.body,
      busNumber,
      organizationId: new Types.ObjectId(orgId)
    });
    res.status(201).json({ success: true, data: bus, message: "Bus created successfully" });
  })
);

busesRouter.put(
  "/:id",
  ...scopeMiddleware,
  isSuperAdminOrOrgStaff("canManageBuses"),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res);
    const updates = { ...req.body } as Record<string, unknown>;
    delete updates.organizationId;

    if (typeof updates.busNumber === "string") {
      const busNumber = updates.busNumber.trim();
      const duplicate = await Bus.findOne({
        organizationId: new Types.ObjectId(orgId!),
        busNumber,
        _id: { $ne: req.params.id }
      }).select("_id");

      if (duplicate) {
        res.status(400).json({
          success: false,
          data: null,
          message: "A bus with this number already exists in your organization."
        });
        return;
      }

      updates.busNumber = busNumber;
    }

    const bus = await Bus.findOneAndUpdate(
      { _id: req.params.id, ...orgFilter(authReq, res) },
      updates,
      { new: true, runValidators: true }
    );
    if (!bus) {
      res.status(404).json({ success: false, data: null, message: "Bus not found" });
      return;
    }
    res.json({ success: true, data: bus, message: "Bus updated successfully" });
  })
);

export default busesRouter;
