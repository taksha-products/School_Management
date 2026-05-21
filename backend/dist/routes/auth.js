"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const Organization_1 = require("../models/Organization");
const User_1 = require("../models/User");
const asyncHandler_1 = require("../utils/asyncHandler");
const jwt_1 = require("../utils/jwt");
const auth_2 = require("../validators/auth");
const authRouter = (0, express_1.Router)();
authRouter.post("/login", auth_2.loginValidation, validate_1.validate, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email, password } = req.body;
    const user = await User_1.User.findOne({ email });
    if (!user || !user.isActive) {
        res.status(401).json({
            success: false,
            data: null,
            message: "Invalid credentials"
        });
        return;
    }
    const passwordMatched = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!passwordMatched) {
        res.status(401).json({
            success: false,
            data: null,
            message: "Invalid credentials"
        });
        return;
    }
    if (user.organizationId) {
        const organization = await Organization_1.Organization.findById(user.organizationId);
        if (!organization?.isActive) {
            res.status(401).json({
                success: false,
                data: null,
                message: "Invalid credentials"
            });
            return;
        }
    }
    let token;
    try {
        token = (0, jwt_1.signUserToken)(user);
    }
    catch {
        res.status(500).json({
            success: false,
            data: null,
            message: "JWT secret is not configured"
        });
        return;
    }
    res.json({
        success: true,
        data: {
            token,
            role: user.role,
            name: user.name,
            organizationId: user.organizationId ? user.organizationId.toString() : null,
            staffPermissions: user.staffPermissions,
            parentStudentIds: user.parentStudentIds?.map((id) => id.toString())
        }
    });
}));
authRouter.post("/me", auth_1.auth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    if (!authReq.user) {
        res.status(401).json({
            success: false,
            data: null,
            message: "Unauthorized"
        });
        return;
    }
    res.json({
        success: true,
        data: authReq.user
    });
}));
exports.default = authRouter;
