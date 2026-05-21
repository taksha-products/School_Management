"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueOrgCode = exports.slugifyOrgName = void 0;
const Organization_1 = require("../models/Organization");
const slugifyOrgName = (name) => name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
exports.slugifyOrgName = slugifyOrgName;
const generateUniqueOrgCode = async (name) => {
    const year = new Date().getFullYear();
    const base = (0, exports.slugifyOrgName)(name) || "org";
    let code = `${base}-${year}`;
    let suffix = 0;
    while (await Organization_1.Organization.exists({ code })) {
        suffix += 1;
        code = `${base}-${year}-${suffix}`;
    }
    return code;
};
exports.generateUniqueOrgCode = generateUniqueOrgCode;
