"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const auth_1 = require("../middleware/auth");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const Bus_1 = require("../models/Bus");
const Student_1 = require("../models/Student");
const StudentTransport_1 = require("../models/StudentTransport");
const asyncHandler_1 = require("../utils/asyncHandler");
const busCapacity_1 = require("../utils/busCapacity");
const cache_1 = require("../utils/cache");
const orgFilter_1 = require("../utils/orgFilter");
const transportRouter = (0, express_1.Router)();
const scopeMiddleware = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope];
const manageTransport = (req, res, next) => {
    if (req.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isOrgAdminOrStaffAny)("canManageBuses", "canViewReports")(req, res, next);
};
const endOfDayUtc = (date) => {
    const d = new Date(date);
    d.setUTCHours(23, 59, 59, 999);
    return d;
};
const startOfDayUtc = (date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
};
transportRouter.get("/", ...scopeMiddleware, manageTransport, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { busId, status, academicYear, search } = req.query;
    const filter = {
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        status: status || "active"
    };
    if (busId && mongoose_1.Types.ObjectId.isValid(busId)) {
        filter.busId = new mongoose_1.Types.ObjectId(busId);
    }
    if (academicYear) {
        filter.academicYear = academicYear;
    }
    if (search) {
        const students = await Student_1.Student.find({
            organizationId: filter.organizationId,
            $or: [{ name: { $regex: search, $options: "i" } }, { grade: { $regex: search, $options: "i" } }]
        }).select("_id");
        filter.studentId = { $in: students };
        if (students.length > 0) {
            filter.studentId = { $in: students };
        }
    }
    const records = await StudentTransport_1.StudentTransport.find(filter)
        .populate("studentId", "name grade parentName parentPhone")
        .populate("busId", "busNumber routeName")
        .sort({ effectiveFrom: -1 });
    res.json({
        success: true,
        data: records,
        message: "Transport registrations fetched successfully"
    });
}));
transportRouter.get("/student/:studentId", ...scopeMiddleware, manageTransport, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const studentId = String(req.params.studentId);
    const student = await Student_1.Student.findOne({
        _id: studentId,
        ...(0, orgFilter_1.orgFilter)(authReq, res)
    });
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    const records = await StudentTransport_1.StudentTransport.find({
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
}));
transportRouter.post("/", ...scopeMiddleware, manageTransport, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { studentId, busId, monthlyTransportFee, pickupStop, dropStop, effectiveFrom, academicYear } = req.body;
    if (!studentId || !busId || !academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "studentId, busId, and academicYear are required"
        });
        return;
    }
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const student = await Student_1.Student.findOne({ _id: studentId, ...(0, orgFilter_1.orgFilter)(authReq, res) });
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    const bus = await Bus_1.Bus.findOne({ _id: busId, organizationId: orgId, status: "active" });
    if (!bus) {
        res.status(404).json({ success: false, data: null, message: "Bus not found or inactive" });
        return;
    }
    const activeTransport = await StudentTransport_1.StudentTransport.findOne({
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
    const activeCount = await (0, busCapacity_1.countActiveStudentsOnBus)(orgId, bus._id);
    if ((0, busCapacity_1.wouldExceedBusCapacity)(bus.capacity, activeCount, 1)) {
        res.status(400).json({
            success: false,
            data: null,
            message: (0, busCapacity_1.busCapacityExceededMessage)(bus.busNumber, bus.capacity, activeCount, 1)
        });
        return;
    }
    const record = await StudentTransport_1.StudentTransport.create({
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
        addedBy: authReq.user?.userId ? new mongoose_1.Types.ObjectId(authReq.user.userId) : undefined
    });
    await (0, cache_1.invalidateOrgReportsCache)(orgId);
    res.status(201).json({
        success: true,
        data: record,
        message: "Student registered for bus transport"
    });
}));
transportRouter.put("/:id", ...scopeMiddleware, manageTransport, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    let record = await StudentTransport_1.StudentTransport.findOne({
        _id: req.params.id,
        ...(0, orgFilter_1.orgFilter)(authReq, res)
    });
    if (!record) {
        res.status(404).json({ success: false, data: null, message: "Transport record not found" });
        return;
    }
    const { busId, monthlyTransportFee, pickupStop, dropStop, effectiveFrom, effectiveTo } = req.body;
    const orgId = record.organizationId;
    if (busId && mongoose_1.Types.ObjectId.isValid(busId) && String(record.busId) !== busId) {
        const newBus = await Bus_1.Bus.findOne({ _id: busId, organizationId: orgId, status: "active" });
        if (!newBus) {
            res.status(404).json({ success: false, data: null, message: "Bus not found or inactive" });
            return;
        }
        const activeOnNewBus = await (0, busCapacity_1.countActiveStudentsOnBus)(orgId, newBus._id);
        if ((0, busCapacity_1.wouldExceedBusCapacity)(newBus.capacity, activeOnNewBus, 1)) {
            res.status(400).json({
                success: false,
                data: null,
                message: (0, busCapacity_1.busCapacityExceededMessage)(newBus.busNumber, newBus.capacity, activeOnNewBus, 1)
            });
            return;
        }
        record.status = "inactive";
        record.effectiveTo = effectiveTo ? new Date(effectiveTo) : new Date();
        await record.save();
        record = await StudentTransport_1.StudentTransport.create({
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
            addedBy: authReq.user?.userId ? new mongoose_1.Types.ObjectId(authReq.user.userId) : undefined
        });
    }
    else {
        if (pickupStop !== undefined)
            record.pickupStop = pickupStop;
        if (dropStop !== undefined)
            record.dropStop = dropStop;
        if (monthlyTransportFee !== undefined)
            record.monthlyTransportFee = monthlyTransportFee;
        if (effectiveFrom)
            record.effectiveFrom = new Date(effectiveFrom);
        if (effectiveTo !== undefined) {
            record.effectiveTo = effectiveTo ? new Date(effectiveTo) : null;
        }
        await record.save();
    }
    await (0, cache_1.invalidateOrgReportsCache)(String(orgId));
    res.json({ success: true, data: record, message: "Transport record updated" });
}));
transportRouter.put("/:id/deactivate", ...scopeMiddleware, manageTransport, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { effectiveTo, reason } = req.body;
    const record = await StudentTransport_1.StudentTransport.findOne({
        _id: req.params.id,
        ...(0, orgFilter_1.orgFilter)(authReq, res),
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
    await (0, cache_1.invalidateOrgReportsCache)(String(record.organizationId));
    res.json({ success: true, data: record, message: "Transport deactivated" });
}));
transportRouter.get("/bus/:busId/students", ...scopeMiddleware, manageTransport, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const busId = String(req.params.busId);
    if (!mongoose_1.Types.ObjectId.isValid(busId)) {
        res.status(400).json({ success: false, data: null, message: "Invalid bus id" });
        return;
    }
    const students = await StudentTransport_1.StudentTransport.find({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        busId: new mongoose_1.Types.ObjectId(busId),
        status: "active"
    })
        .populate("studentId", "name grade parentPhone")
        .sort({ "studentId.name": 1 });
    res.json({
        success: true,
        data: students,
        message: "Bus students fetched successfully"
    });
}));
exports.default = transportRouter;
