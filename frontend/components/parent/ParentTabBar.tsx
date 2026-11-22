"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bus, GraduationCap, Home, UserCircle, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import { useOrgTheme } from "@/hooks/useOrgTheme";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

/** Visual order matches the mobile app: Payments | Marks | Home | Bus | Profile. */
const TABS: Tab[] = [
  {
    href: "/parent/payments",
    label: "Payments",
    icon: Wallet,
    match: (p) => p.startsWith("/parent/payments")
  },
  {
    href: "/parent/marks",
    label: "Marks",
    icon: GraduationCap,
    match: (p) => p.startsWith("/parent/marks")
  },
  {
    href: "/parent/dashboard",
    label: "Home",
    icon: Home,
    match: (p) => p === "/parent/dashboard" || p === "/parent"
  },
  {
    href: "/parent/bus",
    label: "Bus",
    icon: Bus,
    match: (p) =>
      p.startsWith("/parent/bus") ||
      (p.startsWith("/parent/child/") && p.endsWith("/bus"))
  },
  {
    href: "/parent/account",
    label: "Profile",
    icon: UserCircle,
    match: (p) => p.startsWith("/parent/account")
  }
];

/**
 * Floating glass bottom nav — mobile Parent app look on web.
 * Active tab sits in a raised white circle with a soft brand glow.
 */
export const ParentTabBar = (): JSX.Element => {
  const pathname = usePathname();
  const { brandColor } = useOrgTheme();

  return (
    <nav
      aria-label="Parent"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div
        className="pointer-events-auto relative flex h-[76px] w-full max-w-md items-end justify-between rounded-full border border-white/75 px-3 pb-2.5 shadow-[0_8px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl"
        style={{ backgroundColor: "rgba(255,255,255,0.72)" }}
      >
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex w-[18%] flex-col items-center justify-end gap-0.5 pb-0.5 transition",
                active ? "text-[#111827]" : "text-[#5B6472]"
              )}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={cn(
                  "mb-0.5 flex h-11 w-11 items-center justify-center rounded-full transition",
                  active &&
                    "-mt-8 h-16 w-16 border border-white bg-white shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
                )}
                style={
                  active
                    ? {
                        boxShadow: `0 8px 22px color-mix(in srgb, ${brandColor} 35%, transparent)`
                      }
                    : undefined
                }
              >
                <Icon
                  className={cn(active ? "h-7 w-7" : "h-5 w-5")}
                  strokeWidth={active ? 2.25 : 1.75}
                  style={active ? { color: brandColor } : undefined}
                />
              </span>
              <span
                className={cn(
                  "text-[11px] leading-none",
                  active ? "font-extrabold text-[#111827]" : "font-medium text-[#5B6472]"
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
