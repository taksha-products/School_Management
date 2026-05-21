"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mongoose_1 = require("mongoose");
const auth_1 = require("../../middleware/auth");
const orgScope_1 = require("../../middleware/orgScope");
const roleCheck_1 = require("../../middleware/roleCheck");
const Student_1 = require("../../models/Student");
const User_1 = require("../../models/User");
const asyncHandler_1 = require("../../utils/asyncHandler");
const orgFilter_1 = require("../../utils/orgFilter");
const paginate_1 = require("../../utils/paginate");
const orgUsersRouter = (0, express_1.Router)();
const orgUserGuard = [auth_1.auth, orgScope_1.orgScope, roleCheck_1.isOrgAdmin];
const sanitizeUser = (user) => {
    const obj = user.toObject();
    delete obj.passwordHash;
    return obj;
};
const orgFilterForUser = (req, res) => ({
    organizationId: new mongoose_1.Types.ObjectId((0, orgFilter_1.getScopedOrganizationId)(req, res))
});
orgUsersRouter.get("/", ...orgUserGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 30);
    const { data, pagination } = await (0, paginate_1.paginate)(User_1.User, orgFilterForUser(authReq, res), {
        page,
        limit,
        sort: { name: 1 }
    });
    res.json({
        success: true,
        data: data.map(sanitizeUser),
        pagination,
        message: "Organization users fetched successfully"
    });
}));
orgUsersRouter.get("/staff", ...orgUserGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const staff = await User_1.User.find({
        ...orgFilterForUser(authReq, res),
        role: "staff"
    }).select("name email staffPermissions isActive createdAt");
    res.json({
        success: true,
        data: staff,
        message: "Staff users fetched successfully"
    });
}));
orgUsersRouter.get("/parents", ...orgUserGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const parents = await User_1.User.find({
        ...orgFilterForUser(authReq, res),
        role: "parent"
    }).populate("parentStudentIds", "name grade");
    res.json({
        success: true,
        data: parents.map((p) => ({
            _id: p._id,
            name: p.name,
            email: p.email,
            isActive: p.isActive,
            students: p.parentStudentIds
        })),
        message: "Parent users fetched successfully"
    });
}));
orgUsersRouter.post("/", ...orgUserGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { name, email, password, role, staffPermissions, parentStudentIds } = req.body;
    if (!name || !email || !password || !role) {
        res.status(400).json({
            success: false,
            data: null,
            message: "name, email, password, and role (staff|parent) are required"
        });
        return;
    }
    if (role !== "staff" && role !== "parent") {
        res.status(400).json({
            success: false,
            data: null,
            message: "role must be staff or parent"
        });
        return;
    }
    if (role === "parent" && parentStudentIds?.length) {
        const count = await Student_1.Student.countDocuments({
            _id: { $in: parentStudentIds.map((id) => new mongoose_1.Types.ObjectId(id)) },
            organizationId: orgId
        });
        if (count !== parentStudentIds.length) {
            res.status(400).json({
                success: false,
                data: null,
                message: "One or more parentStudentIds are invalid for this organization"
            });
            return;
        }
    }
    const user = await User_1.User.create({
        name,
        email: email.toLowerCase(),
        passwordHash: await bcryptjs_1.default.hash(password, 10),
        role,
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        staffPermissions: role === "staff" ? staffPermissions : undefined,
        parentStudentIds: role === "parent" && parentStudentIds
            ? parentStudentIds.map((id) => new mongoose_1.Types.ObjectId(id))
            : []
    });
    res.status(201).json({
        success: true,
        data: sanitizeUser(user),
        message: "User created successfully"
    });
}));
orgUsersRouter.put("/:id", ...orgUserGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const updates = { ...req.body };
    delete updates.passwordHash;
    delete updates.organizationId;
    delete updates.role;
    if (typeof updates.password === "string") {
        updates.passwordHash = await bcryptjs_1.default.hash(updates.password, 10);
        delete updates.password;
    }
    const user = await User_1.User.findOneAndUpdate({ _id: req.params.id, ...orgFilterForUser(authReq, res) }, updates, { new: true, runValidators: true });
    if (!user) {
        res.status(404).json({
            success: false,
            data: null,
            message: "User not found in this organization"
        });
        return;
    }
    res.json({
        success: true,
        data: sanitizeUser(user),
        message: "User updated successfully"
    });
}));
orgUsersRouter.put("/:id/status", ...orgUserGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
        res.status(400).json({
            success: false,
            data: null,
            message: "isActive (boolean) is required"
        });
        return;
    }
    const user = await User_1.User.findOneAndUpdate({ _id: req.params.id, ...orgFilterForUser(authReq, res) }, { isActive }, { new: true });
    if (!user) {
        res.status(404).json({
            success: false,
            data: null,
            message: "User not found in this organization"
        });
        return;
    }
    res.json({
        success: true,
        data: sanitizeUser(user),
        message: `User ${isActive ? "activated" : "deactivated"} successfully`
    });
}));
orgUsersRouter.delete("/:id", ...orgUserGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const user = await User_1.User.findOneAndUpdate({ _id: req.params.id, ...orgFilterForUser(authReq, res) }, { isActive: false }, { new: true });
    if (!user) {
        res.status(404).json({
            success: false,
            data: null,
            message: "User not found in this organization"
        });
        return;
    }
    res.json({
        success: true,
        data: sanitizeUser(user),
        message: "User deactivated successfully"
    });
}));
exports.default = orgUsersRouter;
