"use client";

import { Bell, CircleHelp } from "lucide-react";
import type { CSSProperties, JSX } from "react";

import { BrandLogo } from "@/components/shared/BrandLogo";
import { useToast } from "@/components/ui/Toast";
import { useOrgTheme } from "@/hooks/useOrgTheme";
import { cn } from "@/lib/utils";

interface ParentBrandHeaderProps {
  /** Home: greeting. Other tabs: page title. */
  title?: string;
  tagline?: string;
  firstName?: string;
  className?: string;
}

/**
 * Page hero. On phones: school logo + actions (app-style).
 * On desktop: title/greeting only — logo/nav live in ParentDesktopHeader.
 */
export const ParentBrandHeader = ({
  title,
  tagline = "Manage your children's fees, bus and more",
  firstName = "Parent",
  className
}: ParentBrandHeaderProps): JSX.Element => {
  const isHome = !title;
  const { theme, displayLabel, brandColor } = useOrgTheme();
  const { showToast } = useToast();
  const schoolName = theme.orgName || displayLabel || "School";

  return (
    <header
      className={cn(
        "relative mb-2 overflow-hidden pb-5 pt-3",
        // Phone: full-bleed wash
        "-mx-4 px-5 md:mx-0 md:rounded-2xl md:border md:border-gray-200 md:bg-white md:px-6 md:py-7 md:shadow-sm",
        isHome &&
          "bg-gradient-to-br from-[color-mix(in_srgb,var(--brand)_18%,white)] via-white to-white md:from-primary-50 md:via-white md:to-white",
        className
      )}
      style={isHome ? ({ ["--brand"]: brandColor } as CSSProperties) : undefined}
    >
      {/* School row + icon actions — mobile only */}
      <div className="relative z-10 flex items-start justify-between gap-3 md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white">
            <BrandLogo compact />
          </div>
          <p className="truncate text-[17px] font-bold tracking-tight text-[#171717]">{schoolName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Notifications"
            className="relative inline-flex h-9 w-9 items-center justify-center"
            style={{ color: brandColor }}
            onClick={() => showToast("info", "No new notifications.")}
          >
            <Bell className="h-[22px] w-[22px]" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-600" />
          </button>
          <button
            type="button"
            aria-label="Help"
            className="inline-flex h-9 w-9 items-center justify-center"
            style={{ color: brandColor }}
            onClick={() =>
              showToast("info", "Contact your school office for support with fees or bus.")
            }
          >
            <CircleHelp className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className={cn("relative z-10 mt-3 md:mt-0", isHome && "pr-16 md:pr-0")}>
        {!isHome ? (
          <p className="mb-1 hidden text-sm font-medium text-gray-500 md:block">Parent portal</p>
        ) : null}
        <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-[#141414] md:text-3xl">
          {isHome ? `Hi, ${firstName} 👋` : title}
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-5 text-[#6B7280]">{tagline}</p>
      </div>
    </header>
  );
};
