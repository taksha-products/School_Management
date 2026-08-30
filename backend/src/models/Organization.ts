import { model, Schema, type Document } from "mongoose";

import type { InstitutionType } from "../constants/institutionTemplates";

export type OrganizationPlan = "trial" | "basic" | "pro" | "cancelled";

export type OrganizationFeatures = {
  busManagement: boolean;
  gpsTracking: boolean;
  schoolFees: boolean;
  onlinePayments: boolean;
  parentPortal: boolean;
  bulkOperations: boolean;
  expenseTracking: boolean;
  whatsappNotifications: boolean;
  transportManagement: boolean;
};

export interface OrgGradeEntry {
  label: string;
  sections: string[];
}

export const ORGANIZATION_FEATURE_KEYS = [
  "busManagement",
  "gpsTracking",
  "schoolFees",
  "onlinePayments",
  "parentPortal",
  "bulkOperations",
  "expenseTracking",
  "whatsappNotifications",
  "transportManagement"
] as const satisfies ReadonlyArray<keyof OrganizationFeatures>;

const organizationFeaturesSchema = new Schema<OrganizationFeatures>(
  {
    busManagement: { type: Boolean, default: true },
    gpsTracking: { type: Boolean, default: false },
    schoolFees: { type: Boolean, default: true },
    onlinePayments: { type: Boolean, default: false },
    parentPortal: { type: Boolean, default: true },
    bulkOperations: { type: Boolean, default: true },
    expenseTracking: { type: Boolean, default: true },
    whatsappNotifications: { type: Boolean, default: false },
    transportManagement: { type: Boolean, default: true }
  },
  { _id: false }
);

const orgGradeSchema = new Schema<OrgGradeEntry>(
  {
    label: { type: String, required: true, trim: true },
    sections: { type: [String], default: [] }
  },
  { _id: false }
);

const defaultOrganizationFeatures = (): OrganizationFeatures => ({
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
export const resolveFeatureEnabled = (
  features: OrganizationFeatures | undefined,
  featureOverrides: Map<string, boolean> | Record<string, boolean> | undefined,
  flag: keyof OrganizationFeatures
): boolean => {
  if (featureOverrides) {
    const override =
      featureOverrides instanceof Map
        ? featureOverrides.get(flag)
        : featureOverrides[flag];
    if (override !== undefined) {
      return override;
    }
  }
  const resolved = features ?? defaultOrganizationFeatures();
  return resolved[flag];
};

export interface IOrganization extends Document {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  logoUrl?: string;
  brandColor?: string;
  displayName?: string;
  plan: OrganizationPlan;
  isActive: boolean;
  deletedAt?: Date;
  currentAcademicYear?: string;
  institutionType: InstitutionType;
  grades: OrgGradeEntry[];
  features: OrganizationFeatures;
  featureOverrides: Map<string, boolean>;
  enabledFeatures: string[];
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    logo: { type: String },
    logoUrl: { type: String },
    brandColor: { type: String },
    displayName: { type: String, trim: true },
    plan: { type: String, enum: ["trial", "basic", "pro", "cancelled"], default: "trial" },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date },
    currentAcademicYear: { type: String, default: "2025-26" },
    institutionType: {
      type: String,
      enum: ["school", "college", "other"],
      default: "school"
    },
    grades: { type: [orgGradeSchema], default: [] },
    features: {
      type: organizationFeaturesSchema,
      default: defaultOrganizationFeatures
    },
    featureOverrides: {
      type: Map,
      of: Boolean,
      default: () => new Map<string, boolean>()
    }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

organizationSchema.virtual("enabledFeatures").get(function (this: IOrganization): string[] {
  return ORGANIZATION_FEATURE_KEYS.filter((key) =>
    resolveFeatureEnabled(this.features, this.featureOverrides, key)
  );
});

organizationSchema.index({ code: 1 }, { unique: true });
organizationSchema.index({ isActive: 1 });
organizationSchema.index({ plan: 1 });

export const Organization = model<IOrganization>("Organization", organizationSchema);
