export type AdminNavIcon =
  | "LayoutDashboard"
  | "Users"
  | "Coins"
  | "Bus"
  | "ChartBar"
  | "Tools"
  | "Settings";

export interface AdminNavChild {
  label: string;
  href: string;
}

export interface AdminNavItem {
  label: string;
  href: string;
  icon: AdminNavIcon;
  badge?: "outstanding";
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
    icon: "Users"
  },
  {
    label: "Fees",
    href: "/admin/fees",
    icon: "Coins",
    badge: "outstanding",
    children: [
      { label: "Collect fees", href: "/admin/fees" },
      { label: "Outstanding dues", href: "/admin/fees/outstanding" },
      { label: "Fee structure", href: "/admin/fees/structure" }
    ]
  },
  {
    label: "Transport",
    href: "/admin/transport",
    icon: "Bus",
    children: [
      { label: "Buses", href: "/admin/transport/buses" },
      { label: "Student transport", href: "/admin/transport/students" },
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
      { label: "Organization", href: "/admin/settings/organization" }
    ]
  }
];

/** @deprecated Use `adminNav` */
export const adminNavItems = adminNav;
