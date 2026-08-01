"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("../../middleware/auth");
const featureFlag_1 = require("../../middleware/featureFlag");
const roleCheck_1 = require("../../middleware/roleCheck");
const Organization_1 = require("../../models/Organization");
const User_1 = require("../../models/User");
const RefreshToken_1 = require("../../models/RefreshToken");
const asyncHandler_1 = require("../../utils/asyncHandler");
const orgCode_1 = require("../../utils/orgCode");
const paginate_1 = require("../../utils/paginate");
const organizationsRouter = (0, express_1.Router)();
const notDeletedFilter = { deletedAt: { $exists: false } };
function buildFeatureUpdate(features) {
    if (typeof features !== "object" || features === null || Array.isArray(features)) {
        return { ok: false, message: "features must be an object of boolean flags" };
    }
    const update = {};
    for (const [key, value] of Object.entries(features)) {
        if (!Organization_1.ORGANIZATION_FEATURE_KEYS.includes(key)) {
            return { ok: false, message: `Invalid feature key: ${key}` };
        }
        if (typeof value !== "boolean") {
            return { ok: false, message: `Feature "${key}" must be a boolean` };
        }
        update[key] = value;
    }
    if (Object.keys(update).length === 0) {
        return { ok: false, message: "At least one feature flag is required" };
    }
    return { ok: true, update };
}
function validateNewPassword(password) {
    if (typeof password !== "string" || password.length === 0) {
        return { ok: false, message: "newPassword is required" };
    }
    if (password.length < 8) {
        return { ok: false, message: "Password must be at least 8 characters" };
    }
    if (!/\d/.test(password)) {
        return { ok: false, message: "Password must contain at least one number" };
    }
    return { ok: true, password };
}
organizationsRouter.get("/", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const organizations = await Organization_1.Organization.aggregate([
        { $match: notDeletedFilter },
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
                features: 1,
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
organizationsRouter.get("/:id/admin", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const organization = await Organization_1.Organization.findById(req.params.id);
    if (!organization) {
        res.status(404).json({
            success: false,
            data: null,
            message: "Organization not found"
        });
        return;
    }
    const admin = await User_1.User.findOne({
        organizationId: organization._id,
        role: "orgAdmin"
    })
        .select("_id name email createdAt")
        .sort({ createdAt: 1 })
        .lean();
    if (!admin) {
        res.status(404).json({
            success: false,
            data: null,
            message: "Organization admin not found"
        });
        return;
    }
    res.json({
        success: true,
        data: {
            _id: admin._id,
            name: admin.name,
            email: admin.email,
            createdAt: admin.createdAt.toISOString()
        },
        message: "Organization admin fetched successfully"
    });
}));
organizationsRouter.post("/:id/reset-password", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { newPassword } = req.body;
    const parsed = validateNewPassword(newPassword);
    if (!parsed.ok) {
        res.status(400).json({
            success: false,
            data: null,
            message: parsed.message
        });
        return;
    }
    const organization = await Organization_1.Organization.findById(req.params.id);
    if (!organization) {
        res.status(404).json({
            success: false,
            data: null,
            message: "Organization not found"
        });
        return;
    }
    const admin = await User_1.User.findOne({
        organizationId: organization._id,
        role: "orgAdmin"
    }).sort({ createdAt: 1 });
    if (!admin) {
        res.status(404).json({
            success: false,
            data: null,
            message: "Organization admin not found"
        });
        return;
    }
    admin.passwordHash = await bcryptjs_1.default.hash(parsed.password, 12);
    await admin.save();
    await RefreshToken_1.RefreshToken.deleteMany({ userId: admin._id });
    res.json({
        success: true,
        data: null,
        message: "Organization admin password reset successfully"
    });
}));
organizationsRouter.patch("/:id/features", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { features } = req.body;
    const parsed = buildFeatureUpdate(features);
    if (!parsed.ok) {
        res.status(400).json({
            success: false,
            data: null,
            message: parsed.message
        });
        return;
    }
    const update = {};
    for (const [key, value] of Object.entries(parsed.update)) {
        update[`features.${key}`] = value;
    }
    const organization = await Organization_1.Organization.findByIdAndUpdate(req.params.id, update, {
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
    await (0, featureFlag_1.invalidateOrgFeaturesCache)(String(organization._id));
    res.json({
        success: true,
        data: organization,
        message: "Organization features updated successfully"
    });
}));
organizationsRouter.put("/:id", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { features, name, address, phone, email, logo, plan, currentAcademicYear } = req.body;
    const update = {};
    if (name !== undefined)
        update.name = name;
    if (address !== undefined)
        update.address = address;
    if (phone !== undefined)
        update.phone = phone;
    if (email !== undefined)
        update.email = email;
    if (logo !== undefined)
        update.logo = logo;
    if (plan !== undefined)
        update.plan = plan;
    if (currentAcademicYear !== undefined)
        update.currentAcademicYear = currentAcademicYear;
    if (features !== undefined) {
        const parsed = buildFeatureUpdate(features);
        if (!parsed.ok) {
            res.status(400).json({
                success: false,
                data: null,
                message: parsed.message
            });
            return;
        }
        for (const [key, value] of Object.entries(parsed.update)) {
            update[`features.${key}`] = value;
        }
    }
    const organization = await Organization_1.Organization.findByIdAndUpdate(req.params.id, update, {
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
    if (features !== undefined) {
        await (0, featureFlag_1.invalidateOrgFeaturesCache)(String(organization._id));
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
organizationsRouter.delete("/:id", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const organization = await Organization_1.Organization.findOne({
        _id: req.params.id,
        ...notDeletedFilter
    });
    if (!organization) {
        res.status(404).json({
            success: false,
            data: null,
            message: "Organization not found"
        });
        return;
    }
    organization.isActive = false;
    organization.deletedAt = new Date();
    organization.plan = "cancelled";
    await organization.save();
    await User_1.User.updateMany({ organizationId: organization._id }, { isActive: false });
    await RefreshToken_1.RefreshToken.deleteMany({ organizationId: organization._id });
    await (0, featureFlag_1.invalidateOrgFeaturesCache)(String(organization._id));
    res.json({
        success: true,
        data: null,
        message: "Organization deactivated successfully"
    });
}));
exports.default = organizationsRouter;
