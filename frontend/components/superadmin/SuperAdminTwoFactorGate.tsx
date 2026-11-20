"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Shield } from "lucide-react";
import { useEffect, type JSX, type ReactNode } from "react";

import { SuperAdminReverifyPanel } from "@/components/superadmin/SuperAdminReverifyPanel";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  SUPER_ADMIN_2FA_GATE_EVENT,
  SUPER_ADMIN_SECURITY_PATH,
  isSuperAdminSecurityPath,
  type TwoFactorStatusResponse
} from "@/lib/twoFactorGate";

interface SuperAdminTwoFactorGateProps {
  children: ReactNode;
}

export const SuperAdminTwoFactorGate = ({ children }: SuperAdminTwoFactorGateProps): JSX.Element => {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const onSecurityPage = isSuperAdminSecurityPath(pathname);

  const statusQuery = useQuery({
    queryKey: ["2fa-status"],
    queryFn: async (): Promise<TwoFactorStatusResponse> => {
      const response = await api.get<TwoFactorStatusResponse>("/api/auth/2fa/status");
      return response.data;
    },
    retry: false,
    staleTime: 30_000
  });

  useEffect(() => {
    const handleGateEvent = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
    };

    window.addEventListener(SUPER_ADMIN_2FA_GATE_EVENT, handleGateEvent);
    return () => window.removeEventListener(SUPER_ADMIN_2FA_GATE_EVENT, handleGateEvent);
  }, [queryClient]);

  const status = statusQuery.data;
  const needsSetup = status?.needsSetup ?? false;
  const needsReverify = status?.needsReverify ?? false;
  const isLoading = statusQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <p className="text-sm text-gray-500">Checking security status...</p>
      </div>
    );
  }

  if (needsReverify) {
    return (
      <SuperAdminReverifyPanel
        onVerified={() => {
          void queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
        }}
      />
    );
  }

  if (needsSetup && !onSecurityPage) {
    return (
      <>
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="flex-1 text-sm text-amber-900">
              Two-factor authentication is required before you can use the super admin portal.
            </p>
            <Link
              href={`${SUPER_ADMIN_SECURITY_PATH}?required=setup`}
              className={cn(
                "inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-hover"
              )}
            >
              Complete security setup
            </Link>
          </div>
        </div>
        <div className="flex min-h-[420px] items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-amber-50 text-amber-600">
              <Shield className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">Security setup required</h2>
            <p className="mt-2 text-sm text-gray-600">
              Enable two-factor authentication on the Security page to access dashboard data and
              management tools.
            </p>
            <Link
              href={`${SUPER_ADMIN_SECURITY_PATH}?required=setup`}
              className={cn(
                "mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-hover"
              )}
            >
              Go to Security
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {needsSetup && onSecurityPage && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-900">
              Complete two-factor authentication setup below to unlock the rest of the super admin
              portal.
            </p>
          </div>
        </div>
      )}
      {children}
    </>
  );
};
