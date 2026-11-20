import { Router } from "express";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import { isOrgAdminOrStaffAny } from "../middleware/roleCheck";
import { Bus } from "../models/Bus";
import { Student } from "../models/Student";
import { StudentTransport } from "../models/StudentTransport";
import { asyncHandler } from "../utils/asyncHandler";
import {
  busCapacityExceededMessage,
  countActiveStudentsOnBus,
  wouldExceedBusCapacity
} from "../utils/busCapacity";
import { invalidateOrgReportsCache } from "../utils/cache";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";

const transportRouter = Router();

const scopeMiddleware = [auth, orgScope, requireOrgScope] as const;

const manageTransport = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void => {
  if (req.user?.role === "superAdmin") {
    next();
    return;
  }
  isOrgAdminOrStaffAny("canManageBuses", "canViewReports")(req, res, next);
};

const endOfDayUtc = (date: Date): Date => {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

const startOfDayUtc = (date: Date): Date => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

transportRouter.get(
  "/",
  ...scopeMiddleware,
  manageTransport,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { busId, status, academicYear, search } = req.query as {
      busId?: string;
      status?: string;
      academicYear?: string;
      search?: string;
    };

    const filter: Record<string, unknown> = {
      ...orgFilter(authReq, res),
      status: status || "active"
    };
    if (busId && Types.ObjectId.isValid(busId)) {
      filter.busId = new Types.ObjectId(busId);
    }
    if (academicYear) {
      filter.academicYear = academicYear;
    }
    if (search) {
      const students = await Student.find({
        organizationId: filter.organizationId,
        $or: [{ name: { $regex: search, $options: "i" } }, { grade: { $regex: search, $options: "i" } }]
      }).select("_id");
      filter.studentId = { $in: students };
      if (students.length > 0) {
        filter.studentId = { $in: students };
      }
    }

    const records = await StudentTransport.find(filter)
      .populate("studentId", "name grade parentName parentPhone")
      .populate("busId", "busNumber routeName")
      .sort({ effectiveFrom: -1 });

    res.json({
      success: true,
      data: records,
      message: "Transport registrations fetched successfully"
    });
  })
);

transportRouter.get(
  "/student/:studentId",
  ...scopeMiddleware,
  manageTransport,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const studentId = String(req.params.studentId);

    const student = await Student.findOne({
      _id: studentId,
      ...orgFilter(authReq, res)
    });
    if (!student) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    const records = await StudentTransport.find({
      organizationId: student.organizationId,
      studentId: student._id
    })
      .populate("busId", "busNumber routeName")
      .sort({ effectiveFrom: -1 });

    const current = records.find((r) => r.status === "active");

    res.json({
      success: true,
      data: {
        current: current ?? null,
        history: records
      },
      message: "Transport history fetched successfully"
    });
  })
);

transportRouter.post(
  "/",
  ...scopeMiddleware,
  manageTransport,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const {
      studentId,
      busId,
      monthlyTransportFee,
      pickupStop,
      dropStop,
      effectiveFrom,
      academicYear
    } = req.body as {
      studentId?: string;
      busId?: string;
      monthlyTransportFee?: number;
      pickupStop?: string;
      dropStop?: string;
      effectiveFrom?: string;
      academicYear?: string;
    };

    if (!studentId || !busId || !academicYear) {
      res.status(400).json({
        success: false,
        data: null,
        message: "studentId, busId, and academicYear are required"
      });
      return;
    }

    const orgId = getScopedOrganizationId(authReq, res)!;
    const student = await Student.findOne({ _id: studentId, ...orgFilter(authReq, res) });
    if (!student) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    const bus = await Bus.findOne({ _id: busId, organizationId: orgId, status: "active" });
    if (!bus) {
      res.status(404).json({ success: false, data: null, message: "Bus not found or inactive" });
      return;
    }

    const activeTransport = await StudentTransport.findOne({
      organizationId: orgId,
      studentId: student._id,
      status: "active"
    });
    if (activeTransport) {
      res.status(409).json({
        success: false,
        data: null,
        message: "Student already registered for transport. Remove current transport first or mark it inactive."
      });
      return;
    }

    const fee = Number(monthlyTransportFee ?? 1500);
    const effectiveFromDate = effectiveFrom ? new Date(effectiveFrom) : new Date();

    const activeCount = await countActiveStudentsOnBus(orgId, bus._id);
    if (wouldExceedBusCapacity(bus.capacity, activeCount, 1)) {
      res.status(400).json({
        success: false,
        data: null,
        message: busCapacityExceededMessage(bus.busNumber, bus.capacity, activeCount, 1)
      });
      return;
    }

    const record = await StudentTransport.create({
      organizationId: orgId,
      studentId: student._id,
      busId: bus._id,
      monthlyTransportFee: fee,
      pickupStop: pickupStop?.trim(),
      dropStop: dropStop?.trim(),
      effectiveFrom: effectiveFromDate,
      effectiveTo: null,
      status: "active",
      academicYear,
      addedBy: authReq.user?.userId ? new Types.ObjectId(authReq.user.userId) : undefined
    });

    await invalidateOrgReportsCache(orgId);
    res.status(201).json({
      success: true,
      data: record,
      message: "Student registered for bus transport"
    });
  })
);

transportRouter.put(
  "/:id",
  ...scopeMiddleware,
  manageTransport,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    let record = await StudentTransport.findOne({
      _id: req.params.id,
      ...orgFilter(authReq, res)
    });
    if (!record) {
      res.status(404).json({ success: false, data: null, message: "Transport record not found" });
      return;
    }

    const { busId, monthlyTransportFee, pickupStop, dropStop, effectiveFrom, effectiveTo } =
      req.body as {
        busId?: string;
        monthlyTransportFee?: number;
        pickupStop?: string;
        dropStop?: string;
        effectiveFrom?: string;
        effectiveTo?: string | null;
      };

    const orgId = record.organizationId;

    if (busId && Types.ObjectId.isValid(busId) && String(record.busId) !== busId) {
      const newBus = await Bus.findOne({ _id: busId, organizationId: orgId, status: "active" });
      if (!newBus) {
        res.status(404).json({ success: false, data: null, message: "Bus not found or inactive" });
        return;
      }

      const activeOnNewBus = await countActiveStudentsOnBus(orgId, newBus._id);
      if (wouldExceedBusCapacity(newBus.capacity, activeOnNewBus, 1)) {
        res.status(400).json({
          success: false,
          data: null,
          message: busCapacityExceededMessage(
            newBus.busNumber,
            newBus.capacity,
            activeOnNewBus,
            1
          )
        });
        return;
      }

      record.status = "inactive";
      record.effectiveTo = effectiveTo ? new Date(effectiveTo) : new Date();
      await record.save();

      record = await StudentTransport.create({
        organizationId: orgId,
        studentId: record.studentId,
        busId: newBus._id,
        monthlyTransportFee: monthlyTransportFee ?? record.monthlyTransportFee,
        pickupStop: pickupStop ?? record.pickupStop,
        dropStop: dropStop ?? record.dropStop,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        effectiveTo: null,
        status: "active",
        academicYear: record.academicYear,
        addedBy: authReq.user?.userId ? new Types.ObjectId(authReq.user.userId) : undefined
      });
    } else {
      if (pickupStop !== undefined) record.pickupStop = pickupStop;
      if (dropStop !== undefined) record.dropStop = dropStop;
      if (monthlyTransportFee !== undefined) record.monthlyTransportFee = monthlyTransportFee;
      if (effectiveFrom) record.effectiveFrom = new Date(effectiveFrom);
      if (effectiveTo !== undefined) {
        record.effectiveTo = effectiveTo ? new Date(effectiveTo) : null;
      }
      await record.save();
    }

    await invalidateOrgReportsCache(String(orgId));
    res.json({ success: true, data: record, message: "Transport record updated" });
  })
);

transportRouter.put(
  "/:id/deactivate",
  ...scopeMiddleware,
  manageTransport,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { effectiveTo, reason } = req.body as { effectiveTo?: string; reason?: string };

    const record = await StudentTransport.findOne({
      _id: req.params.id,
      ...orgFilter(authReq, res),
      status: "active"
    });
    if (!record) {
      res.status(404).json({ success: false, data: null, message: "Active transport record not found" });
      return;
    }

    record.status = "inactive";
    record.effectiveTo = effectiveTo ? new Date(effectiveTo) : endOfDayUtc(new Date());
    if (reason) {
      record.dropStop = reason;
    }

    await invalidateOrgReportsCache(String(record.organizationId));
    res.json({ success: true, data: record, message: "Transport deactivated" });
  })
);

transportRouter.get(
  "/bus/:busId/students",
  ...scopeMiddleware,
  manageTransport,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const busId = String(req.params.busId);
    if (!Types.ObjectId.isValid(busId)) {
      res.status(400).json({ success: false, data: null, message: "Invalid bus id" });
      return;
    }

    const students = await StudentTransport.find({
      ...orgFilter(authReq, res),
      busId: new Types.ObjectId(busId),
      status: "active"
    })
      .populate("studentId", "name grade parentPhone")
      .sort({ "studentId.name": 1 });

    res.json({
      success: true,
      data: students,
      message: "Bus students fetched successfully"
    });
  })
);

export default transportRouter;