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
    const bus = await Bus_1.Bus.create({
        ...req.body,
        organizationId: (0, orgFilter_1.getScopedOrganizationId)(authReq, res)
    });
    res.status(201).json({ success: true, data: bus, message: "Bus created successfully" });
}));
busesRouter.put("/:id", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canManageBuses"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const bus = await Bus_1.Bus.findOneAndUpdate({ _id: req.params.id, ...(0, orgFilter_1.orgFilter)(authReq, res) }, req.body, { new: true, runValidators: true });
    if (!bus) {
        res.status(404).json({ success: false, data: null, message: "Bus not found" });
        return;
    }
    res.json({ success: true, data: bus, message: "Bus updated successfully" });
}));
exports.default = busesRouter;
