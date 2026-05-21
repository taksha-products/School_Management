import {
  Bus,
  ChartNoAxesColumn,
  DollarSign,
  LayoutDashboard,
  Users,
  Wallet
} from "lucide-react";

import { canDo, getUser } from "@/lib/auth";
import type { NavEntry } from "./Sidebar";

export const getStaffNavItems = (): NavEntry[] => {
  const user = getUser();
  const items: NavEntry[] = [
    { href: "/staff/dashboard", label: "Dashboard", icon: LayoutDashboard }
  ];

  if (canDo("canCollectFees")) {
    items.push(
      { href: "/staff/school-fees", label: "School Fees", icon: Wallet },
      { href: "/staff/fees", label: "Bus Fees", icon: DollarSign }
    );
  }
  if (canDo("canViewReports")) {
    items.push({ href: "/staff/reports", label: "Reports", icon: ChartNoAxesColumn });
  }
  if (canDo("canManageStudents")) {
    items.push({ href: "/staff/students", label: "Students", icon: Users });
  }
  if (canDo("canManageBuses")) {
    items.push({ href: "/staff/buses", label: "Buses", icon: Bus });
  }

  return items;
};
