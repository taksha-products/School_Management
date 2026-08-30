"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrganizationBranding = void 0;
const Organization_1 = require("../models/Organization");
const logoStorage_1 = require("../utils/logoStorage");
const orgThemeService_1 = require("./orgThemeService");
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const parseOptionalBrandColor = (value) => {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || value === "") {
        return null;
    }
    const normalized = String(value).trim();
    if (!HEX_COLOR_PATTERN.test(normalized)) {
        return undefined;
    }
    return normalized;
};
const updateOrganizationBranding = async (orgId, body, file) => {
    const brandColor = parseOptionalBrandColor(body.brandColor);
    if (body.brandColor !== undefined && brandColor === undefined) {
        return {
            ok: false,
            status: 400,
            message: "brandColor must be a valid hex color (e.g. #1A56DB)"
        };
    }
    const update = {};
    if (body.displayName !== undefined) {
        const trimmed = String(body.displayName).trim();
        update.displayName = trimmed.length > 0 ? trimmed : null;
    }
    if (brandColor !== undefined) {
        update.brandColor = brandColor;
    }
    if (file?.buffer && file.mimetype) {
        update.logoUrl = (0, logoStorage_1.saveOrganizationLogo)(orgId, file.buffer, file.mimetype);
    }
    if (Object.keys(update).length === 0) {
        return {
            ok: false,
            status: 400,
            message: "No branding fields to update"
        };
    }
    const org = await Organization_1.Organization.findByIdAndUpdate(orgId, update, {
        new: true,
        runValidators: true
    }).select("name logoUrl brandColor displayName");
    if (!org) {
        return {
            ok: false,
            status: 404,
            message: "Organization not found"
        };
    }
    await (0, orgThemeService_1.invalidateOrgThemeCache)(orgId);
    return {
        ok: true,
        theme: {
            logoUrl: org.logoUrl ?? null,
            brandColor: org.brandColor ?? null,
            displayName: org.displayName ?? null,
            orgName: org.name
        }
    };
};
exports.updateOrganizationBranding = updateOrganizationBranding;
