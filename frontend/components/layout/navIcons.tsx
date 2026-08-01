import {
  BarChart3,
  Bus,
  Coins,
  LayoutDashboard,
  MapPin,
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
  MapPin,
  ChartBar: BarChart3,
  Tools: Wrench,
  Settings
};
