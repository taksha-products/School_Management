"use client";

import { Menu } from "lucide-react";
import type { JSX, ReactNode } from "react";

import { OrgAdminHeaderActions } from "@/components/layout/OrgAdminHeaderActions";
import { useOrgAdminLayout } from "@/components/layout/OrgAdminLayoutContext";

interface PageWrapperProps {
  title: ReactNode;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}

export const PageWrapper = ({
  title,
  subtitle,
  children,
  action
}: PageWrapperProps): JSX.Element => {
  const orgLayout = useOrgAdminLayout();

  if (orgLayout) {
    return (
      <section className="px-4 py-5 md:px-8 md:py-6">
        <div className="mx-auto w-full max-w-[1400px] space-y-6">
          <div className="flex items-start justify-between gap-3 md:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <button
                type="button"
                onClick={orgLayout.openMobileNav}
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold leading-tight text-gray-900 md:text-[22px]">{title}</h1>
                {subtitle && <p className="mt-1 text-[13px] text-gray-500">{subtitle}</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5 md:gap-3">
              {action}
              <OrgAdminHeaderActions />
            </div>
          </div>
          <div className="flex flex-col gap-6">{children}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-6 py-6 md:px-8">
      <div className="mx-auto w-full max-w-[1400px] space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="mt-1 text-[13px] text-gray-500">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        <div className="flex flex-col gap-6">{children}</div>
      </div>
    </section>
  );
};
