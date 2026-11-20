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
const validate_1 = require("../middleware/validate");
const orgFilter_1 = require("../utils/orgFilter");
const buses_1 = require("../validators/buses");
const busesRouter = (0, express_1.Router)();
const scopeMiddleware = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, roleCheck_1.canAccessOrg];
busesRouter.get("/", ...scopeMiddleware, (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isOrgAdminOrStaffAny)("canManageBuses", "canViewReports")(req, res, next);
}, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = new mongoose_1.Types.ObjectId((0, orgFilter_1.getScopedOrganizationId)(authReq, res));
    const buses = await Bus_1.Bus.aggregate([
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
}));
busesRouter.get("/:id", ...scopeMiddleware, (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isOrgAdminOrStaffAny)("canManageBuses", "canViewReports")(req, res, next);
}, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const bus = await Bus_1.Bus.findOne({ _id: req.params.id, ...(0, orgFilter_1.orgFilter)(authReq, res) });
    if (!bus) {
        res.status(404).json({ success: false, data: null, message: "Bus not found" });
        return;
    }
    res.json({ success: true, data: bus, message: "Bus fetched successfully" });
}));
busesRouter.post("/", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canManageBuses"), buses_1.createBusValidation, validate_1.validate, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    if (!orgId) {
        res.status(403).json({
            success: false,
            data: null,
            message: "Forbidden: organization scope is required"
        });
        return;
    }
    const busNumber = String(req.body.busNumber ?? "").trim();
    const duplicate = await Bus_1.Bus.findOne({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
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
    const bus = await Bus_1.Bus.create({
        ...req.body,
        busNumber,
        organizationId: new mongoose_1.Types.ObjectId(orgId)
    });
    res.status(201).json({ success: true, data: bus, message: "Bus created successfully" });
}));
busesRouter.put("/:id", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canManageBuses"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const updates = { ...req.body };
    delete updates.organizationId;
    if (typeof updates.busNumber === "string") {
        const busNumber = updates.busNumber.trim();
        const duplicate = await Bus_1.Bus.findOne({
            organizationId: new mongoose_1.Types.ObjectId(orgId),
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
    const bus = await Bus_1.Bus.findOneAndUpdate({ _id: req.params.id, ...(0, orgFilter_1.orgFilter)(authReq, res) }, updates, { new: true, runValidators: true });
    if (!bus) {
        res.status(404).json({ success: false, data: null, message: "Bus not found" });
        return;
    }
    res.json({ success: true, data: bus, message: "Bus updated successfully" });
}));
exports.default = busesRouter;
