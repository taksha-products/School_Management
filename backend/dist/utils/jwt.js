"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signUserToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const signUserToken = (user) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT secret is not configured");
    }
    return jsonwebtoken_1.default.sign({
        userId: user._id.toString(),
        role: user.role,
        organizationId: user.organizationId ? user.organizationId.toString() : null,
        name: user.name,
        staffPermissions: user.staffPermissions,
        parentStudentIds: user.parentStudentIds?.map((id) => id.toString())
    }, secret, { expiresIn: "7d" });
};
exports.signUserToken = signUserToken;
