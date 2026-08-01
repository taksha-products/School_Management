export type OrganizationFeatureKey =
  | "busManagement"
  | "gpsTracking"
  | "schoolFees"
  | "onlinePayments"
  | "parentPortal"
  | "bulkOperations"
  | "expenseTracking"
  | "whatsappNotifications"
  | "transportManagement";

export type OrganizationFeatures = Record<OrganizationFeatureKey, boolean>;

export const ORGANIZATION_FEATURE_KEYS: OrganizationFeatureKey[] = [
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

export const DEFAULT_ORGANIZATION_FEATURES: OrganizationFeatures = {
  busManagement: true,
  gpsTracking: false,
  schoolFees: true,
  onlinePayments: false,
  parentPortal: true,
  bulkOperations: true,
  expenseTracking: true,
  whatsappNotifications: false,
  transportManagement: true
};

export interface OrganizationFeatureDefinition {
  key: OrganizationFeatureKey;
  label: string;
  description: string;
}

export const ORGANIZATION_FEATURE_DEFINITIONS: OrganizationFeatureDefinition[] = [
  {
    key: "busManagement",
    label: "Bus Management",
    description: "Manage buses, routes, drivers, and fleet records."
  },
  {
    key: "gpsTracking",
    label: "GPS Tracking",
    description: "Live bus location tracking on a map via GPS devices."
  },
  {
    key: "schoolFees",
    label: "School Fees",
    description: "Fee structures, collection, and outstanding fee reports."
  },
  {
    key: "onlinePayments",
    label: "Online Payments",
    description: "Razorpay-powered online fee payments and UPI QR codes."
  },
  {
    key: "parentPortal",
    label: "Parent Portal",
    description: "Parent login to view children, fees, and payment history."
  },
  {
    key: "bulkOperations",
    label: "Bulk Operations",
    description: "Bulk student upload, bus assignment, and fee collection."
  },
  {
    key: "expenseTracking",
    label: "Expense Tracking",
    description: "Track bus expenses such as diesel, maintenance, and other costs."
  },
  {
    key: "whatsappNotifications",
    label: "WhatsApp Notifications",
    description: "Send fee reminders and alerts to parents via WhatsApp."
  },
  {
    key: "transportManagement",
    label: "Transport Management",
    description: "Student transport assignments, stops, and transport fees."
  }
];

export function resolveOrganizationFeatures(
  features: Partial<OrganizationFeatures> | undefined
): OrganizationFeatures {
  return { ...DEFAULT_ORGANIZATION_FEATURES, ...features };
}
