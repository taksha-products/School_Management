"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bus, ChevronDown, LogOut, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import { BrandLogo } from "@/components/shared/BrandLogo";
import { useFeesOutstandingBadge } from "@/hooks/useFeesOutstandingBadge";
import { useOrgFeatures } from "@/hooks/useOrgFeatures";
import { useOrgTheme } from "@/hooks/useOrgTheme";
import { getUser, logout } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { adminNav, type AdminNavItem } from "./adminNav";
import { adminNavIconMap } from "./navIcons";

const STORAGE_KEY = "sidebar_collapsed";

const pathMatches = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

const navSectionMatches = (pathname: string, item: AdminNavItem): boolean => {
  if (item.href.startsWith("/admin/fees") && pathname.startsWith("/admin/fees")) {
    return true;
  }
  if (
    item.href.startsWith("/admin/transport") &&
    (pathname.startsWith("/admin/transport") || pathname.startsWith("/admin/gps"))
  ) {
    return true;
  }
  return pathMatches(pathname, item.href);
};

const itemIsActive = (pathname: string, item: AdminNavItem): boolean => {
  if (item.children?.length) {
    return (
      item.children.some((c) => pathMatches(pathname, c.href)) ||
      navSectionMatches(pathname, item)
    );
  }
  return navSectionMatches(pathname, item);
};

const sectionKeyForPath = (pathname: string): string | null => {
  for (const item of adminNav) {
    if (!item.children?.length) continue;
    if (
      item.children.some((c) => pathMatches(pathname, c.href)) ||
      navSectionMatches(pathname, item)
    ) {
      return item.href;
    }
  }
  return null;
};

interface SidebarProps {
  items?: AdminNavItem[];
  legacyItems?: NavEntry[];
  brand?: string;
  roleBadge?: string;
  whiteLabel?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const userInitials = (name: string): string =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const formatRoleLabel = (role: string): string => {
  if (role === "orgAdmin") return "Org Admin";
  return role.replace(/([A-Z])/g, " $1").trim();
};

const SIDEBAR_NOISE_DATA_URI = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/**
 * Same layered look as the super admin sidebar, but driven by the org's
 * brand color (--brand-color) so white-labelled schools keep their color.
 */
const BrandSidebarBackdrop = (): JSX.Element => (
  <>
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          "linear-gradient(180deg, color-mix(in srgb, var(--brand-color) 78%, white) 0%, var(--brand-color) 45%, color-mix(in srgb, var(--brand-color) 82%, black) 100%)"
      }}
      aria-hidden
    />
    {/* Wave artwork: its light/dark shapes only, tinted by the brand color */}
    <div
      className="absolute inset-0 bg-cover bg-[center_42%] bg-no-repeat opacity-70 mix-blend-luminosity"
      style={{ backgroundImage: "url(/images/sidebarBG.png)" }}
      aria-hidden
    />
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgb(255 255 255 / 0.12) 0%, transparent 50%, color-mix(in srgb, var(--brand-color) 40%, black) 100%)",
        opacity: 0.55
      }}
      aria-hidden
    />
    <div
      className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-white/20 blur-3xl"
      aria-hidden
    />
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.28] mix-blend-overlay"
      style={{ backgroundImage: SIDEBAR_NOISE_DATA_URI }}
      aria-hidden
    />
  </>
);

/** Row look shared by every nav item (no padding — callers add it). */
const navRowClass = (active: boolean): string =>
  cn(
    "flex items-center rounded-md text-[15px] font-medium transition-all duration-200",
    active
      ? "bg-white/[0.18] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)] ring-1 ring-inset ring-white/25 backdrop-blur-sm"
      : "text-white/90 hover:bg-white/10 hover:text-white"
  );

const navPadClass = (collapsed: boolean): string =>
  collapsed ? "justify-center py-3" : "gap-3 px-4 py-3";

const NAV_ICON_CLASS = "h-[22px] w-[22px] shrink-0 stroke-[1.75]";

const LegacySidebar = ({
  items,
  brand,
  roleBadge,
  collapsed,
  whiteLabel = false
}: {
  items: NavEntry[];
  brand: string;
  roleBadge?: string;
  collapsed: boolean;
  whiteLabel?: boolean;
}): JSX.Element => {
  const pathname = usePathname();
  const user = getUser();

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-200",
        collapsed ? "w-14" : "w-60"
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-gray-200 px-5">
        {whiteLabel ? (
          <BrandLogo compact={collapsed} />
        ) : (
          <>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Bus className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            {!collapsed && (
              <div>
                <p className="text-lg font-bold text-gray-900">{brand}</p>
                {roleBadge && (
                  <span className="mt-0.5 inline-block rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {roleBadge}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {items.map((entry, index) => {
          if ("type" in entry && entry.type === "divider") {
            if (collapsed) return null;
            return (
              <p
                key={`divider-${entry.label}-${index}`}
                className="px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-gray-400"
              >
                {entry.label}
              </p>
            );
          }
          if ("type" in entry) return null;
          const { href, label, icon: Icon } = entry;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150",
                active
                  ? "bg-primary-50 font-medium text-primary shadow-[inset_3px_0_0_0_var(--brand-color)]"
                  : "text-gray-700 hover:bg-gray-50 hover:text-primary"
              )}
            >
              <Icon
                className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-gray-500")}
              />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
      {!collapsed && user && (
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary">
              {userInitials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
              <p className="truncate text-xs capitalize text-gray-500">{user.role.replace(/([A-Z])/g, " $1").trim()}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </aside>
  );
};

export const Sidebar = ({
  items = adminNav,
  legacyItems,
  brand = "TAKSHA",
  roleBadge,
  whiteLabel = false,
  mobileOpen = false,
  onMobileClose
}: SidebarProps): JSX.Element => {
  const pathname = usePathname();
  const outstandingBadge = useFeesOutstandingBadge();
  const { enabledFeatures } = useOrgFeatures();
  const { theme, displayLabel } = useOrgTheme();
  const user = getUser();
  const [collapsed, setCollapsed] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    const active = sectionKeyForPath(pathname);
    if (active) setOpenSection(active);
  }, [pathname]);

  const toggleSection = useCallback((href: string) => {
    setOpenSection((prev) => (prev === href ? null : href));
  }, []);

  if (legacyItems) {
    return (
      <LegacySidebar
        items={legacyItems}
        brand={brand}
        roleBadge={roleBadge}
        collapsed={collapsed}
        whiteLabel={whiteLabel}
      />
    );
  }

  const navContent = useMemo(() => {
    const visibleItems = items.filter(
      (item) => !item.featureFlag || enabledFeatures.includes(item.featureFlag)
    );

    return visibleItems.map((item) => {
        const Icon = adminNavIconMap[item.icon];
        const active = itemIsActive(pathname, item);
        const hasChildren = !!item.children?.length;
        const isOpen = openSection === item.href;
        const showBadge =
          item.badge === "outstanding" && outstandingBadge > 0 && !collapsed;

        if (hasChildren) {
          return (
            <div key={item.href}>
              <button
                type="button"
                onClick={() => {
                  if (collapsed) {
                    window.location.href = item.children![0].href;
                    return;
                  }
                  toggleSection(item.href);
                }}
                title={collapsed ? item.label : undefined}
                className={cn(navRowClass(active), navPadClass(collapsed), "w-full")}
              >
                <Icon className={NAV_ICON_CLASS} aria-hidden />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {showBadge && (
                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                        {outstandingBadge > 99 ? "99+" : outstandingBadge}
                      </span>
                    )}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-white/70 transition-transform duration-200",
                        isOpen && "rotate-180"
                      )}
                    />
                  </>
                )}
              </button>
              {!collapsed && (
                <div
                  className={cn(
                    "overflow-hidden transition-[max-height] duration-200 ease-in-out",
                    isOpen ? "max-h-96" : "max-h-0"
                  )}
                >
                  <div className="space-y-0.5 py-1">
                    {item
                      .children!.filter(
                        (child) =>
                          !child.featureFlag || enabledFeatures.includes(child.featureFlag)
                      )
                      .map((child) => {
                        const childActive = pathMatches(pathname, child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onMobileClose}
                            className={cn(
                              "block rounded-md py-2 pl-[3.25rem] pr-3 text-sm transition-colors",
                              childActive
                                ? "bg-white/10 font-semibold text-white"
                                : "text-white/80 hover:bg-white/10 hover:text-white"
                            )}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          );
        }

        if (item.quickAction) {
          return (
            <div
              key={item.href}
              className={cn(navRowClass(active), "pr-1.5")}
            >
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                onClick={onMobileClose}
                className={cn("flex flex-1 items-center", navPadClass(collapsed))}
              >
                <Icon className={NAV_ICON_CLASS} aria-hidden />
                {!collapsed && <span>{item.label}</span>}
              </Link>
              {!collapsed && (
                <Link
                  href={item.quickAction.href}
                  title={item.quickAction.title}
                  onClick={onMobileClose}
                  className="rounded-md p-1.5 text-white/70 transition hover:bg-white/15 hover:text-white"
                >
                  <Upload className="h-4 w-4" />
                </Link>
              )}
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            onClick={onMobileClose}
            className={cn(navRowClass(active), navPadClass(collapsed))}
          >
            <Icon className={NAV_ICON_CLASS} aria-hidden />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      });
  }, [
    items,
    pathname,
    openSection,
    collapsed,
    outstandingBadge,
    toggleSection,
    enabledFeatures,
    onMobileClose
  ]);

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
          "fixed inset-y-0 left-0 z-50 flex h-full shrink-0 flex-col overflow-hidden transition-[width,transform] duration-200 md:relative md:z-auto md:translate-x-0",
          collapsed ? "w-[4.5rem]" : "w-[17.5rem]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <BrandSidebarBackdrop />
        <div
          className={cn(
            "relative z-10 flex h-full min-h-0 flex-col pb-4 pt-9",
            collapsed ? "px-3" : "px-7"
          )}
        >
          {/* Brand */}
          <div className="shrink-0">
            {whiteLabel && theme.logoUrl ? (
              <div
                className={cn(
                  "inline-flex items-center rounded-lg bg-white shadow-sm",
                  collapsed ? "p-1" : "px-3 py-2"
                )}
              >
                <img
                  src={theme.logoUrl}
                  alt={displayLabel}
                  className={
                    collapsed
                      ? "max-h-8 w-auto max-w-[2rem] object-contain"
                      : "max-h-10 w-auto max-w-[12rem] object-contain object-left"
                  }
                />
              </div>
            ) : collapsed ? (
              <div className="flex h-10 w-full items-center justify-center rounded-md bg-white/15 ring-1 ring-inset ring-white/25">
                <Bus className="h-5 w-5 text-white" strokeWidth={2} aria-hidden />
              </div>
            ) : (
              <>
                <p className="truncate text-[25px] font-semibold leading-tight text-white">
                  {whiteLabel ? displayLabel : brand}
                </p>
                <p className="mt-1 text-[9px] font-medium uppercase tracking-[3px] text-white/90">
                  {roleBadge ?? "School Management"}
                </p>
              </>
            )}
          </div>

          <nav className="mt-10 min-h-0 flex-1 space-y-1 overflow-y-auto">{navContent}</nav>

          {/* User + log out */}
          <div className="mt-6 shrink-0 border-t border-white/25 pt-6">
            {!collapsed && user && (
              <div className="flex items-center gap-3 px-1">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-primary">
                  {userInitials(user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-white">{user.name}</p>
                  <p className="truncate text-sm text-white/85">{formatRoleLabel(user.role)}</p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              title={collapsed ? "Log out" : undefined}
              className={cn(
                "flex w-full items-center rounded-md py-2.5 text-[15px] font-medium text-white/95 transition hover:bg-white/10",
                collapsed ? "justify-center" : "mt-5 gap-3 px-4"
              )}
            >
              <LogOut className={NAV_ICON_CLASS} aria-hidden />
              {!collapsed && "Log out"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCollapsed((prev) => {
                  const next = !prev;
                  localStorage.setItem(STORAGE_KEY, String(next));
                  return next;
                });
              }}
              className="mt-2 hidden w-full rounded-md py-2 text-center text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white md:block"
            >
              {collapsed ? "→" : "← Collapse"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export type { AdminNavItem };

export type NavEntry =
  | { href: string; label: string; icon: import("lucide-react").LucideIcon }
  | { type: "divider"; label: string };
