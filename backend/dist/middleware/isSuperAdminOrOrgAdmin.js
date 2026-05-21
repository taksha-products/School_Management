"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSuperAdminOrOrgAdmin = void 0;
const roleCheck_1 = require("./roleCheck");
const isSuperAdminOrOrgAdmin = (req, res, next) => {
    if (req.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isOrgAdmin)(req, res, next);
};
exports.isSuperAdminOrOrgAdmin = isSuperAdminOrOrgAdmin;
