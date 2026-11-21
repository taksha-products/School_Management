"use client";

import { useEffect, useState, type JSX } from "react";
import {
  ChevronRight,
  CircleHelp,
  Info,
  LogOut,
  Bell,
  Settings,
  User
} from "lucide-react";

import { BrandLogo } from "@/components/shared/BrandLogo";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useOrgTheme } from "@/hooks/useOrgTheme";
import { bootstrapSession, logout, type AuthUser } from "@/lib/auth";

const menuItems = [
  {
    key: "settings",
    label: "Account Settings",
    icon: Settings,
    message: "Profile editing will be available soon."
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: Bell,
    message: "Notification preferences will be available soon."
  },
  {
    key: "help",
    label: "Help & Support",
    icon: CircleHelp,
    message: "Contact your school office for fees, bus, or account help."
  },
  {
    key: "about",
    label: "About",
    icon: Info,
    message: "EduNex Parent Portal — branding is set by your school."
  }
] as const;

const ParentAccountPage = (): JSX.Element => {
  const { showToast } = useToast();
  const { theme, displayLabel } = useOrgTheme();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    void bootstrapSession().then(setUser);
  }, []);

  const phone = user?.phone ? `+91 ${user.phone}` : "Phone not set";

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-gray-200 bg-gradient-to-br from-primary-50 via-white to-white px-6 py-7">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Your parent account</p>
      </div>

      <Card className="mb-4 rounded-2xl p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
            <User className="h-8 w-8" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold text-gray-900">{user?.name ?? "Parent"}</p>
            <p className="mt-1 text-base text-gray-500">{phone}</p>
          </div>
        </div>
      </Card>

      <Card className="mb-4 rounded-2xl p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50">
            <BrandLogo compact />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500">School</p>
            <p className="truncate text-lg font-bold text-gray-900">
              {theme.orgName || displayLabel}
            </p>
            {theme.displayName ? (
              <p className="truncate text-sm text-gray-500">{theme.displayName}</p>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="mb-6 rounded-2xl p-0" flush>
        <ul>
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.key}>
                {index > 0 ? <div className="mx-5 h-px bg-gray-100" /> : null}
                <button
                  type="button"
                  onClick={() => showToast("info", item.message)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-gray-50"
                >
                  <Icon className="h-5 w-5 text-primary" />
                  <span className="flex-1 text-sm font-medium text-gray-900">{item.label}</span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <button
        type="button"
        onClick={() => void logout()}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-rose-500 bg-white text-base font-bold text-rose-600 transition hover:bg-rose-50"
      >
        <LogOut className="h-5 w-5" />
        Log out
      </button>
    </div>
  );
};

export default ParentAccountPage;
