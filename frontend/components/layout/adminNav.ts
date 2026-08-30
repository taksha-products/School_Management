export type AdminNavIcon =
  | "LayoutDashboard"
  | "Users"
  | "Coins"
  | "Bus"
  | "MapPin"
  | "ChartBar"
  | "Tools"
  | "Settings";

export interface AdminNavChild {
  label: string;
  href: string;
  featureFlag?: string;
}

export interface AdminNavQuickAction {
  href: string;
  title: string;
}

export interface AdminNavItem {
  label: string;
  href: string;
  icon: AdminNavIcon;
  badge?: "outstanding";
  featureFlag?: string;
  quickAction?: AdminNavQuickAction;
  children?: AdminNavChild[];
}

export const adminNav: AdminNavItem[] = [
  {
    label: "Overview",
    href: "/admin/dashboard",
    icon: "LayoutDashboard"
  },
  {
    label: "Students",
    href: "/admin/students",
    icon: "Users",
    quickAction: {
      href: "/admin/bulk/upload-students",
      title: "Import students"
    }
  },
  {
    label: "Fees",
    href: "/admin/fees/outstanding",
    icon: "Coins",
    badge: "outstanding",
    children: [
      { label: "Outstanding dues", href: "/admin/fees/outstanding" },
      { label: "Fee structure", href: "/admin/fees/structure" },
      { label: "Payment history", href: "/admin/fees/history" }
    ]
  },
  {
    label: "Transport",
    href: "/admin/transport/buses",
    icon: "Bus",
    children: [
      { label: "Buses", href: "/admin/transport/buses" },
      { label: "Student transport", href: "/admin/transport/students" },
      { label: "Live Tracking", href: "/admin/gps/live", featureFlag: "gpsTracking" },
      { label: "Expenses", href: "/admin/transport/expenses" }
    ]
  },
  {
    label: "Reports",
    href: "/admin/reports",
    icon: "ChartBar"
  },
  {
    label: "Bulk tools",
    href: "/admin/bulk/upload-students",
    icon: "Tools",
    children: [
      { label: "Upload students", href: "/admin/bulk/upload-students" },
      { label: "Assign transport", href: "/admin/bulk/assign-buses" },
      { label: "Assign fee structure", href: "/admin/bulk/assign-fees" },
      { label: "Bulk fee collection", href: "/admin/bulk/fee-collection" },
      { label: "Grade promotion", href: "/admin/bulk/grade-promotion" },
      { label: "Export data", href: "/admin/bulk/export" }
    ]
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: "Settings",
    children: [
      { label: "Staff accounts", href: "/admin/settings/staff" },
      { label: "Parent accounts", href: "/admin/settings/parents" },
      { label: "Organization", href: "/admin/settings/organization" },
      { label: "Branding", href: "/admin/settings/branding" },
      { label: "Security", href: "/admin/settings/security" }
    ]
  }
];

/** @deprecated Use `adminNav` */
export const adminNavItems = adminNav;
