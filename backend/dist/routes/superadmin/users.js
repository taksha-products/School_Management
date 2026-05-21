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
superAdminUsersRouter.put("/:id", auth_1.auth, roleCheck_1.isSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const updates = { ...req.body };
    delete updates.passwordHash;
    if (typeof updates.password === "string") {
        updates.passwordHash = await bcryptjs_1.default.hash(updates.password, 10);
        delete updates.password;
    }
    const user = await User_1.User.findByIdAndUpdate(req.params.id, updates, {
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
