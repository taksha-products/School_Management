"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mongoose_1 = require("mongoose");
const auth_1 = require("../../middleware/auth");
const roleCheck_1 = require("../../middleware/roleCheck");
const User_1 = require("../../models/User");
const asyncHandler_1 = require("../../utils/asyncHandler");
const paginate_1 = require("../../utils/paginate");
const superAdminUsersRouter = (0, express_1.Router)();
const sanitizeUser = (user) => {
    const obj = user.toObject();
    delete obj.passwordHash;
    return obj;
};
superAdminUsersRouter.get("/", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 30);
    const { data, pagination } = await (0, paginate_1.paginate)(User_1.User, {}, {
        page,
        limit,
        sort: { createdAt: -1 },
        populate: { path: "organizationId", select: "name code" }
    });
    res.json({
        success: true,
        data: data.map(sanitizeUser),
        pagination,
        message: "Users fetched successfully"
    });
}));
superAdminUsersRouter.post("/", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { name, email, password, role, organizationId, staffPermissions, parentStudentIds } = req.body;
    if (!name || !email || !password || !role) {
        res.status(400).json({
            success: false,
            data: null,
            message: "name, email, password, and role are required"
        });
        return;
    }
    if (role === "superAdmin" && organizationId) {
        res.status(400).json({
            success: false,
            data: null,
            message: "superAdmin must not have an organizationId"
        });
        return;
    }
    if (role !== "superAdmin" && !organizationId) {
        res.status(400).json({
            success: false,
            data: null,
            message: "organizationId is required for non-superAdmin users"
        });
        return;
    }
    const user = await User_1.User.create({
        name,
        email: email.toLowerCase(),
        passwordHash: await bcryptjs_1.default.hash(password, 10),
        role,
        organizationId: organizationId ? new mongoose_1.Types.ObjectId(organizationId) : null,
        staffPermissions: role === "staff" ? staffPermissions : undefined,
        parentStudentIds: role === "parent" && parentStudentIds
            ? parentStudentIds.map((id) => new mongoose_1.Types.ObjectId(id))
            : undefined
    });
    res.status(201).json({
        success: true,
        data: sanitizeUser(user),
        message: "User created successfully"
    });
}));
const SUPER_ADMIN_USER_UPDATE_FIELDS = new Set(["name", "email", "password", "isActive"]);
superAdminUsersRouter.put("/:id", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const body = req.body;
    const unknownFields = Object.keys(body).filter((field) => !SUPER_ADMIN_USER_UPDATE_FIELDS.has(field));
    if (unknownFields.length > 0) {
        res.status(400).json({
            success: false,
            data: null,
            message: `Only name, email, password, and isActive may be updated (${unknownFields.join(", ")} rejected)`
        });
        return;
    }
    const existingUser = await User_1.User.findById(req.params.id);
    if (!existingUser) {
        res.status(404).json({
            success: false,
            data: null,
            message: "User not found"
        });
        return;
    }
    if (authReq.user?.userId === existingUser._id.toString() &&
        body.isActive === false) {
        res.status(400).json({
            success: false,
            data: null,
            message: "You cannot deactivate your own account"
        });
        return;
    }
    const updates = {};
    if (typeof body.name === "string") {
        const name = body.name.trim();
        if (!name) {
            res.status(400).json({
                success: false,
                data: null,
                message: "name cannot be empty"
            });
            return;
        }
        updates.name = name;
    }
    if (typeof body.email === "string") {
        const email = body.email.trim().toLowerCase();
        if (!email) {
            res.status(400).json({
                success: false,
                data: null,
                message: "email cannot be empty"
            });
            return;
        }
        updates.email = email;
    }
    if (typeof body.password === "string") {
        if (body.password.length < 8) {
            res.status(400).json({
                success: false,
                data: null,
                message: "password must be at least 8 characters"
            });
            return;
        }
        updates.passwordHash = await bcryptjs_1.default.hash(body.password, 10);
    }
    if (typeof body.isActive === "boolean") {
        updates.isActive = body.isActive;
    }
    if (Object.keys(updates).length === 0) {
        res.status(400).json({
            success: false,
            data: null,
            message: "No valid fields to update"
        });
        return;
    }
    const user = await User_1.User.findByIdAndUpdate(existingUser._id, updates, {
        new: true,
        runValidators: true
    }).populate("organizationId", "name code");
    if (!user) {
        res.status(404).json({
            success: false,
            data: null,
            message: "User not found"
        });
        return;
    }
    res.json({
        success: true,
        data: sanitizeUser(user),
        message: "User updated successfully"
    });
}));
exports.default = superAdminUsersRouter;
