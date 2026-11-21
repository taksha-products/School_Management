import { Router, type RequestHandler, type Response } from "express";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import {
  canAccessOrg,
  isOrgAdminOrStaffAny,
  isSuperAdminOrOrgStaff
} from "../middleware/roleCheck";
import { Bus, type IBus } from "../models/Bus";
import { GpsDevice } from "../models/GpsDevice";
import {
  assertTrackerAvailable,
  noTracker,
  normalizeTrackerId,
  retryBusTrackerSync,
  syncBusTracker,
  toTrackerView,
  TrackerConflictError,
  type BusTrackerView
} from "../services/busTrackerService";
import { asyncHandler } from "../utils/asyncHandler";
import { validate } from "../middleware/validate";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";
import { createBusValidation, updateBusValidation } from "../validators/buses";

const busesRouter = Router();

const scopeMiddleware = [auth, orgScope, requireOrgScope, canAccessOrg] as const;

/** A malformed id can never match a bus: answer 404 instead of letting Mongoose throw a 500. */
const requireValidBusId: RequestHandler = (req, res, next) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) {
    res.status(404).json({ success: false, data: null, message: "Bus not found" });
    return;
  }
  next();
};

/** Fields an admin may change on a bus (everything else in the body is ignored). */
const UPDATABLE_BUS_FIELDS = [
  "busNumber",
  "routeName",
  "routeNumber",
  "driverName",
  "driverPhone",
  "capacity",
  "status"
] as const;

const pickBusUpdates = (body: Record<string, unknown>): Record<string, unknown> => {
  const updates: Record<string, unknown> = {};
  for (const field of UPDATABLE_BUS_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }
  if (typeof updates.busNumber === "string") {
    updates.busNumber = updates.busNumber.trim();
  }
  if (typeof updates.routeNumber === "string") {
    updates.routeNumber = updates.routeNumber.trim();
  }
  return updates;
};

const respondTrackerConflict = (res: Response, error: TrackerConflictError): void => {
  res.status(409).json({ success: false, data: null, message: error.message });
};

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
        $lookup: {
          from: "gpsdevices",
          let: { busId: "$_id", orgId: "$organizationId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$busId", "$$busId"] },
                    { $eq: ["$organizationId", "$$orgId"] }
                  ]
                }
              }
            },
            { $limit: 1 }
          ],
          as: "trackerDevice"
        }
      },
      { $addFields: { trackerDevice: { $first: "$trackerDevice" } } },
      {
        $project: {
          organizationId: 1,
          busNumber: 1,
          routeName: 1,
          routeNumber: 1,
          driverName: 1,
          driverPhone: 1,
          capacity: 1,
          status: 1,
          activeStudentCount: { $size: "$activeStudents" },
          tracker: {
            $cond: [
              { $ifNull: ["$trackerDevice", false] },
              {
                trackerId: "$trackerDevice.traccarUniqueId",
                status: {
                  $cond: [
                    { $eq: ["$trackerDevice.isActive", false] },
                    "disabled",
                    "$trackerDevice.syncStatus"
                  ]
                },
                error: { $ifNull: ["$trackerDevice.syncError", null] },
                lastSeen: { $ifNull: ["$trackerDevice.lastSeen", null] }
              },
              noTracker
            ]
          },
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
  requireValidBusId,
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
    const device = await GpsDevice.findOne({ busId: bus._id, organizationId: bus.organizationId });
    res.json({
      success: true,
      data: { ...bus.toObject(), tracker: toTrackerView(device) },
      message: "Bus fetched successfully"
    });
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

    const trackerId = normalizeTrackerId((req.body as Record<string, unknown>).trackerId);
    if (typeof trackerId === "string") {
      try {
        await assertTrackerAvailable(trackerId);
      } catch (error) {
        if (error instanceof TrackerConflictError) {
          respondTrackerConflict(res, error);
          return;
        }
        throw error;
      }
    }

    const bus = await Bus.create({
      ...pickBusUpdates(req.body as Record<string, unknown>),
      busNumber,
      organizationId: new Types.ObjectId(orgId)
    });

    let tracker: BusTrackerView = noTracker;
    if (trackerId !== undefined) {
      try {
        tracker = await syncBusTracker({ organizationId: orgId, bus, trackerId });
      } catch (error) {
        if (!(error instanceof TrackerConflictError)) {
          throw error;
        }
        // Lost a race with another request for the same tracker ID; bus is saved without it.
        tracker = { ...noTracker, error: error.message };
      }
    }

    res.status(201).json({
      success: true,
      data: { ...bus.toObject(), tracker },
      message: "Bus created successfully"
    });
  })
);

busesRouter.put(
  "/:id",
  ...scopeMiddleware,
  requireValidBusId,
  isSuperAdminOrOrgStaff("canManageBuses"),
  updateBusValidation,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const body = req.body as Record<string, unknown>;
    const updates = pickBusUpdates(body);
    const trackerId = normalizeTrackerId(body.trackerId);

    if (typeof updates.busNumber === "string") {
      const duplicate = await Bus.findOne({
        organizationId: new Types.ObjectId(orgId),
        busNumber: updates.busNumber,
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
    }

    if (typeof trackerId === "string") {
      try {
        await assertTrackerAvailable(trackerId, new Types.ObjectId(String(req.params.id)));
      } catch (error) {
        if (error instanceof TrackerConflictError) {
          respondTrackerConflict(res, error);
          return;
        }
        throw error;
      }
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

    let tracker: BusTrackerView;
    try {
      tracker = await syncBusTracker({ organizationId: orgId, bus, trackerId });
    } catch (error) {
      if (!(error instanceof TrackerConflictError)) {
        throw error;
      }
      tracker = { ...noTracker, error: error.message };
    }

    res.json({
      success: true,
      data: { ...bus.toObject(), tracker },
      message: "Bus updated successfully"
    });
  })
);

busesRouter.post(
  "/:id/tracker/sync",
  ...scopeMiddleware,
  requireValidBusId,
  isSuperAdminOrOrgStaff("canManageBuses"),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;

    const bus: IBus | null = await Bus.findOne({ _id: req.params.id, ...orgFilter(authReq, res) });
    if (!bus) {
      res.status(404).json({ success: false, data: null, message: "Bus not found" });
      return;
    }

    const tracker = await retryBusTrackerSync(orgId, bus);
    res.json({ success: true, data: { tracker }, message: "Tracker sync attempted" });
  })
);

export default busesRouter;
