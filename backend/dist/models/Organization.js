"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Organization = exports.resolveFeatureEnabled = exports.ORGANIZATION_FEATURE_KEYS = void 0;
const mongoose_1 = require("mongoose");
exports.ORGANIZATION_FEATURE_KEYS = [
    "busManagement",
    "gpsTracking",
    "schoolFees",
    "onlinePayments",
    "parentPortal",
    "bulkOperations",
    "expenseTracking",
    "whatsappNotifications",
    "transportManagement"
];
const organizationFeaturesSchema = new mongoose_1.Schema({
    busManagement: { type: Boolean, default: true },
    gpsTracking: { type: Boolean, default: false },
    schoolFees: { type: Boolean, default: true },
    onlinePayments: { type: Boolean, default: false },
    parentPortal: { type: Boolean, default: true },
    bulkOperations: { type: Boolean, default: true },
    expenseTracking: { type: Boolean, default: true },
    whatsappNotifications: { type: Boolean, default: false },
    transportManagement: { type: Boolean, default: true }
}, { _id: false });
const defaultOrganizationFeatures = () => ({
    busManagement: true,
    gpsTracking: false,
    schoolFees: true,
    onlinePayments: false,
    parentPortal: true,
    bulkOperations: true,
    expenseTracking: true,
    whatsappNotifications: false,
    transportManagement: true
});
/**
 * Resolves whether a feature is enabled, applying {@link featureOverrides} when present.
 */
const resolveFeatureEnabled = (features, featureOverrides, flag) => {
    if (featureOverrides) {
        const override = featureOverrides instanceof Map
            ? featureOverrides.get(flag)
            : featureOverrides[flag];
        if (override !== undefined) {
            return override;
        }
    }
    const resolved = features ?? defaultOrganizationFeatures();
    return resolved[flag];
};
exports.resolveFeatureEnabled = resolveFeatureEnabled;
// Migration note: existing organizations receive feature defaults on next read/save (Mongoose defaults).
const organizationSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    logo: { type: String },
    plan: { type: String, enum: ["trial", "basic", "pro", "cancelled"], default: "trial" },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date },
    currentAcademicYear: { type: String, default: "2025-26" },
    features: {
        type: organizationFeaturesSchema,
        default: defaultOrganizationFeatures
    },
    featureOverrides: {
        type: Map,
        of: Boolean,
        default: () => new Map()
    }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });
organizationSchema.virtual("enabledFeatures").get(function () {
    return exports.ORGANIZATION_FEATURE_KEYS.filter((key) => (0, exports.resolveFeatureEnabled)(this.features, this.featureOverrides, key));
});
organizationSchema.index({ code: 1 }, { unique: true });
organizationSchema.index({ isActive: 1 });
organizationSchema.index({ plan: 1 });
exports.Organization = (0, mongoose_1.model)("Organization", organizationSchema);
