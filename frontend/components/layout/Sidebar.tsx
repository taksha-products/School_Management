"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bus, ChevronDown, LogOut, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import { BrandLogo } from "@/components/shared/BrandLogo";
import { useFeesOutstandingBadge } from "@/hooks/useFeesOutstandingBadge";
import { useOrgFeatures } from "@/hooks/useOrgFeatures";
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
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150",
                  active
                    ? "bg-primary-50 font-medium text-primary shadow-[inset_3px_0_0_0_var(--brand-color)]"
                    : "text-gray-700 hover:bg-gray-50 hover:text-primary"
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    active ? "text-primary" : "text-gray-500"
                  )}
                />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {showBadge && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-600">
                        {outstandingBadge > 99 ? "99+" : outstandingBadge}
                      </span>
                    )}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200",
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
                              "block rounded-lg py-1.5 pl-10 pr-3 text-[13px] transition-colors",
                              childActive
                                ? "font-medium text-primary"
                                : "text-gray-500 hover:text-primary"
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
              className={cn(
                "flex items-center rounded-lg pr-1 transition-all duration-150",
                active ? "bg-primary-50 shadow-[inset_3px_0_0_0_var(--brand-color)]" : "hover:bg-gray-50"
              )}
            >
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                onClick={onMobileClose}
                className={cn(
                  "flex flex-1 items-center gap-2.5 px-3 py-2 text-sm",
                  active ? "font-medium text-primary" : "text-gray-700 hover:text-primary"
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    active ? "text-primary" : "text-gray-500"
                  )}
                />
                {!collapsed && <span>{item.label}</span>}
              </Link>
              {!collapsed && (
                <Link
                  href={item.quickAction.href}
                  title={item.quickAction.title}
                  onClick={onMobileClose}
                  className="rounded-md p-1.5 text-gray-400 transition hover:bg-primary-100 hover:text-primary"
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
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150",
              active
                ? "bg-primary-50 font-medium text-primary shadow-[inset_3px_0_0_0_var(--brand-color)]"
                : "text-gray-700 hover:bg-gray-50 hover:text-primary"
            )}
          >
            <Icon
              className={cn(
                "h-[18px] w-[18px] shrink-0",
                active ? "text-primary" : "text-gray-500"
              )}
            />
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
          "fixed inset-y-0 left-0 z-50 flex h-full shrink-0 flex-col border-r border-gray-200 bg-white transition-[width,transform] duration-200 md:relative md:z-auto md:translate-x-0",
          collapsed ? "w-14" : "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
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
                <p className="text-lg font-bold leading-tight text-gray-900">{brand}</p>
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

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">{navContent}</nav>

      {!collapsed && user && (
        <div className="shrink-0 border-t border-gray-200 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary">
              {userInitials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
              <p className="truncate text-xs capitalize text-gray-500">{user.role.replace(/([A-Z])/g, " $1").trim()}</p>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
          });
        }}
        className="shrink-0 border-t border-gray-200 py-2.5 text-center text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600"
      >
        {collapsed ? "→" : "← Collapse"}
      </button>
    </aside>
    </>
  );
};

export type { AdminNavItem };

export type NavEntry =
  | { href: string; label: string; icon: import("lucide-react").LucideIcon }
  | { type: "divider"; label: string };
