"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwt_1 = require("../utils/jwt");
const extractBearerToken = (authorization) => {
    if (!authorization?.startsWith("Bearer ")) {
        return null;
    }
    return authorization.slice("Bearer ".length);
};
const extractAccessToken = (req) => {
    const cookieToken = req.cookies?.access_token;
    if (cookieToken) {
        return cookieToken;
    }
    const isMobileClient = req.headers["x-api-client"] === "mobile";
    if (isMobileClient) {
        return extractBearerToken(req.headers.authorization);
    }
    return null;
};
/**
 * Authenticates requests via httpOnly access_token cookie.
 * Bearer Authorization is accepted only when `x-api-client: mobile` is set.
 */
const auth = (req, res, next) => {
    const token = extractAccessToken(req);
    if (!token) {
        res.status(401).json({
            success: false,
            data: null,
            message: "Unauthorized: token missing",
            code: "TOKEN_INVALID"
        });
        return;
    }
    try {
        const decoded = (0, jwt_1.verifyAccessToken)(token);
        req.user = {
            userId: decoded.userId,
            role: decoded.role,
            organizationId: decoded.organizationId,
            name: decoded.name,
            staffPermissions: decoded.staffPermissions ?? decoded.permissions,
            parentStudentIds: decoded.parentStudentIds
        };
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            res.status(401).json({
                success: false,
                data: null,
                message: "Access token expired",
                code: "TOKEN_EXPIRED"
            });
            return;
        }
        res.status(401).json({
            success: false,
            data: null,
            message: "Unauthorized: invalid token",
            code: "TOKEN_INVALID"
        });
    }
};
exports.auth = auth;
