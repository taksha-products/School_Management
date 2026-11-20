"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import type { JSX } from "react";

import { getUser, logout } from "@/lib/auth";
import { cn } from "@/lib/utils";

import type { NavEntry } from "./Sidebar";

const SIDEBAR_NOISE_DATA_URI = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const userInitials = (name: string): string =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const formatRoleLabel = (role: string): string => {
  if (role === "superAdmin") return "Super Admin";
  return role.replace(/([A-Z])/g, " $1").trim();
};

const SidebarBackdrop = (): JSX.Element => (
  <>
    {/* Fallback + warmth under the artwork */}
    <div
      className="absolute inset-0 bg-[linear-gradient(180deg,#FF8F3F_0%,#F97316_45%,#DC4F0A_100%)]"
      aria-hidden
    />
    <div
      className="absolute inset-0 bg-cover bg-[center_42%] bg-no-repeat"
      style={{ backgroundImage: "url(/images/sidebarBG.png)" }}
      aria-hidden
    />
    {/* Depth: light top, richer mid, readable footer */}
    <div
      className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/12 via-[#F97316]/10 to-[#7C2D12]/55"
      aria-hidden
    />
    <div
      className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-200/25 via-transparent to-orange-900/35 mix-blend-soft-light"
      aria-hidden
    />
    <div
      className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-amber-100/30 blur-3xl"
      aria-hidden
    />
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.28] mix-blend-overlay"
      style={{ backgroundImage: SIDEBAR_NOISE_DATA_URI }}
      aria-hidden
    />
  </>
);

interface SuperAdminSidebarProps {
  items: NavEntry[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const SuperAdminSidebar = ({
  items,
  mobileOpen = false,
  onMobileClose
}: SuperAdminSidebarProps): JSX.Element => {
  const pathname = usePathname();
  const user = getUser();
  const displayName = user?.name?.trim() || "Super Admin";
  const roleLabel = user ? formatRoleLabel(user.role) : "Super Admin";

  const navItems = items.filter(
    (entry): entry is Extract<NavEntry, { href: string }> => !("type" in entry)
  );

  const panel = (
    <>
      <SidebarBackdrop />
      <div className="relative z-10 flex h-full min-h-0 flex-col px-7 pb-6 pt-9">
        <div className="shrink-0">
          <p className="text-[25px] font-semibold leading-tight text-white">EduNex</p>
          <p className="mt-1 text-[9px] font-medium uppercase tracking-[3px] text-white/90">
            School Management
          </p>
        </div>

        <nav className="mt-10 flex-1 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={onMobileClose}
                className={cn(
                  "flex items-center gap-3 rounded-md px-4 py-3 text-[15px] font-medium text-white transition-all duration-200",
                  active
                    ? "bg-white/18 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-sm ring-1 ring-inset ring-white/25"
                    : "text-white/90 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-[22px] w-[22px] shrink-0 stroke-[1.75]" aria-hidden />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 shrink-0 border-t border-white/25 pt-6">
          {user && (
            <div className="flex items-center gap-3 px-1">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-primary">
                {userInitials(displayName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-white">{displayName}</p>
                <p className="truncate text-sm text-white/85">{roleLabel}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-5 flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-[15px] font-medium text-white/95 transition hover:bg-white/10"
          >
            <LogOut className="h-[22px] w-[22px] shrink-0 stroke-[1.75]" aria-hidden />
            Log out
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-[17.5rem] shrink-0 flex-col overflow-hidden transition-transform duration-200 md:relative md:z-auto md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {panel}
      </aside>
    </>
  );
};
