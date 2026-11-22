"use client";

import { useEffect, useState, type JSX } from "react";
import {
  Bell,
  ChevronRight,
  CircleHelp,
  Info,
  LogOut,
  Settings
} from "lucide-react";

import { ParentBrandHeader } from "@/components/parent/ParentBrandHeader";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { useToast } from "@/components/ui/Toast";
import { useOrgTheme } from "@/hooks/useOrgTheme";
import { bootstrapSession, logout, type AuthUser } from "@/lib/auth";
import { INK, pastelAt, SOFT_TEXT, SUCCESS_GREEN } from "@/lib/pastel";

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
    label: "About App",
    icon: Info,
    message: "EduNex Parent — fees, bus tracking, and school updates. Branding is set by your school."
  }
] as const;

const ParentAccountPage = (): JSX.Element => {
  const { showToast } = useToast();
  const { theme, displayLabel } = useOrgTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const avatarPastel = pastelAt(2);

  useEffect(() => {
    void bootstrapSession().then(setUser);
  }, []);

  const phone = user?.phone ? `+91 ${user.phone}` : "Phone not set";
  const [firstName, ...rest] = (user?.name ?? "Parent").split(" ");
  const initial = (user?.name ?? "P").slice(0, 1).toUpperCase();

  return (
    <div>
      <ParentBrandHeader title="Profile" tagline="Your parent account" />

      <div className="md:grid md:grid-cols-2 md:gap-4">
      <div className="relative mb-3 flex min-h-[190px] items-end overflow-hidden rounded-[20px] bg-[#F4F5F6] p-[22px] md:mb-0 md:border md:border-gray-200 md:bg-white md:shadow-sm">
        <div className="relative z-10 min-w-0 flex-1 pr-4">
          <p className="text-[13px]" style={{ color: SOFT_TEXT }}>
            Parent account
          </p>
          <p className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight" style={{ color: INK }}>
            {firstName}
            {rest.length ? (
              <>
                <br />
                {rest.join(" ")}
              </>
            ) : null}
          </p>
          <span
            className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-white"
            style={{ backgroundColor: SUCCESS_GREEN }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            {phone}
          </span>
        </div>
        <span
          className="flex h-[120px] w-[120px] shrink-0 items-center justify-center rounded-full text-[48px] font-extrabold"
          style={{ backgroundColor: avatarPastel.bg, color: avatarPastel.accent }}
        >
          {initial}
        </span>
      </div>

      <div className="mb-3 flex items-center gap-3 rounded-[20px] bg-[#F4F5F6] px-4 py-3.5 md:mb-0 md:border md:border-gray-200 md:bg-white md:shadow-sm">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
          <BrandLogo compact />
        </span>
        <div className="min-w-0">
          <p className="text-[13px]" style={{ color: SOFT_TEXT }}>
            School
          </p>
          <p className="truncate text-[17px] font-bold" style={{ color: INK }}>
            {theme.orgName || displayLabel}
          </p>
        </div>
      </div>
      </div>

      <div className="mb-5 mt-3 overflow-hidden rounded-[20px] bg-[#F4F5F6] md:border md:border-gray-200 md:bg-white md:shadow-sm">
        <ul>
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.key}>
                {index > 0 ? <div className="mx-4 h-px bg-[#E8E8E8]" /> : null}
                <button
                  type="button"
                  onClick={() => showToast("info", item.message)}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-black/[0.02]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                    <Icon className="h-5 w-5 text-[#141414]" />
                  </span>
                  <span className="flex-1 text-base font-medium text-[#141414]">{item.label}</span>
                  <ChevronRight className="h-4 w-4" style={{ color: SOFT_TEXT }} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => void logout()}
        className="flex h-[54px] w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-rose-600 bg-white text-base font-bold text-rose-600 transition hover:bg-rose-50 md:max-w-sm"
      >
        <LogOut className="h-5 w-5" />
        Log out
      </button>
    </div>
  );
};

export default ParentAccountPage;
