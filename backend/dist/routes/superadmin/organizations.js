"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("../../middleware/auth");
const roleCheck_1 = require("../../middleware/roleCheck");
const Organization_1 = require("../../models/Organization");
const User_1 = require("../../models/User");
const asyncHandler_1 = require("../../utils/asyncHandler");
const orgCode_1 = require("../../utils/orgCode");
const paginate_1 = require("../../utils/paginate");
const organizationsRouter = (0, express_1.Router)();
organizationsRouter.get("/", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const organizations = await Organization_1.Organization.aggregate([
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
                address: 1,
                phone: 1,
                email: 1,
                logo: 1,
                plan: 1,
                isActive: 1,
                studentCount: { $size: "$students" },
                createdAt: 1,
                updatedAt: 1
            }
        },
        { $sort: { name: 1 } }
    ]);
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 20);
    const { data, pagination } = (0, paginate_1.paginateArray)(organizations, page, limit);
    res.json({
        success: true,
        data,
        pagination,
        message: "Organizations fetched successfully"
    });
}));
organizationsRouter.post("/", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { name, address, phone, email, plan } = req.body;
    if (!name) {
        res.status(400).json({
            success: false,
            data: null,
            message: "name is required"
        });
        return;
    }
    const code = await (0, orgCode_1.generateUniqueOrgCode)(name);
    const organization = await Organization_1.Organization.create({
        name,
        code,
        address,
        phone,
        email,
        plan: plan ?? "trial"
    });
    const slug = code.split("-").slice(0, -1).join("-") || code;
    const adminEmail = email || `admin@${slug}.local`;
    const temporaryPassword = crypto_1.default.randomBytes(4).toString("hex");
    const orgAdmin = await User_1.User.create({
        name: `${name} Admin`,
        email: adminEmail.toLowerCase(),
        passwordHash: await bcryptjs_1.default.hash(temporaryPassword, 10),
        role: "orgAdmin",
        organizationId: organization._id,
        isActive: true
    });
    res.status(201).json({
        success: true,
        data: {
            organization,
            adminCredentials: {
                email: orgAdmin.email,
                temporaryPassword
            }
        },
        message: "Organization created successfully"
    });
}));
organizationsRouter.put("/:id", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const organization = await Organization_1.Organization.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
    });
    if (!organization) {
        res.status(404).json({
            success: false,
            data: null,
            message: "Organization not found"
        });
        return;
    }
    res.json({
        success: true,
        data: organization,
        message: "Organization updated successfully"
    });
}));
organizationsRouter.put("/:id/status", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
        res.status(400).json({
            success: false,
            data: null,
            message: "isActive (boolean) is required"
        });
        return;
    }
    const organization = await Organization_1.Organization.findByIdAndUpdate(req.params.id, { isActive }, { new: true, runValidators: true });
    if (!organization) {
        res.status(404).json({
            success: false,
            data: null,
            message: "Organization not found"
        });
        return;
    }
    res.json({
        success: true,
        data: organization,
        message: `Organization ${isActive ? "activated" : "deactivated"} successfully`
    });
}));
exports.default = organizationsRouter;
