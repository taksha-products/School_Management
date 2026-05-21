"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth = (req, res, next) => {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;
    if (!token) {
        res.status(401).json({
            success: false,
            data: null,
            message: "Unauthorized: token missing"
        });
        return;
    }
    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            res.status(500).json({
                success: false,
                data: null,
                message: "JWT secret is not configured"
            });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        req.user = {
            userId: decoded.userId,
            role: decoded.role,
            organizationId: decoded.organizationId ?? null,
            name: decoded.name,
            staffPermissions: decoded.staffPermissions,
            parentStudentIds: decoded.parentStudentIds
        };
        next();
    }
    catch {
        res.status(401).json({
            success: false,
            data: null,
            message: "Unauthorized: invalid token"
        });
    }
};
exports.auth = auth;
