import {
  BarChart3,
  Bus,
  Coins,
  LayoutDashboard,
  Settings,
  Users,
  Wrench,
  type LucideIcon
} from "lucide-react";

import type { AdminNavIcon } from "./adminNav";

export const adminNavIconMap: Record<AdminNavIcon, LucideIcon> = {
  LayoutDashboard,
  Users,
  Coins,
  Bus,
  ChartBar: BarChart3,
  Tools: Wrench,
  Settings
};
