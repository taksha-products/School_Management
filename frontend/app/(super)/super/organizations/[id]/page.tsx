"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, type JSX } from "react";

import { OrgAdminPanel } from "@/components/superadmin/OrgAdminPanel";
import { OrgBrandingPanel } from "@/components/superadmin/OrgBrandingPanel";
import { OrgFeaturesPanel } from "@/components/superadmin/OrgFeaturesPanel";
import { OrgOverviewPanel } from "@/components/superadmin/OrgOverviewPanel";
import { OrgSetupPanel } from "@/components/superadmin/OrgSetupPanel";
import { SuperPageWrapper } from "@/components/layout/SuperPageWrapper";
import { SuperAdminSectionCard } from "@/components/superadmin/SuperAdminSectionCard";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types/schoolFees";

type OrgDetailTab = "overview" | "features" | "setup" | "branding" | "admin";

const TABS: { id: OrgDetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "features", label: "Features" },
  { id: "setup", label: "Setup" },
  { id: "branding", label: "Branding" },
  { id: "admin", label: "Admin Account" }
];

const planBadgeClass = (plan: Organization["plan"]): string => {
  switch (plan) {
    case "pro":
      return "bg-violet-100 text-violet-800";
    case "basic":
      return "bg-blue-100 text-blue-800";
    case "trial":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const OrganizationDetailPage = (): JSX.Element => {
  const params = useParams();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const organizationId = String(params.id ?? "");

  const activeTab = (searchParams.get("tab") as OrgDetailTab | null) ?? "overview";

  const orgQuery = useQuery({
    queryKey: ["super-org", organizationId],
    queryFn: async () =>
      (await api.get<{ data: Organization }>(`/api/superadmin/organizations/${organizationId}`))
        .data.data,
    enabled: organizationId.length > 0
  });

  const organization = orgQuery.data;

  const setupInitialConfig = useMemo(
    () => ({
      institutionType: organization?.institutionType ?? "school",
      grades: organization?.grades ?? []
    }),
    [organization]
  );

  const refreshOrganization = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["super-org", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["super-orgs"] });
  };

  if (orgQuery.isLoading) {
    return (
      <SuperPageWrapper title="Organization">
        <SuperAdminSectionCard>
          <p className="text-sm text-gray-500">Loading organization…</p>
        </SuperAdminSectionCard>
      </SuperPageWrapper>
    );
  }

  if (orgQuery.isError || !organization) {
    return (
      <SuperPageWrapper title="Organization">
        <SuperAdminSectionCard>
          <p className="text-sm text-red-600">Organization not found.</p>
          <Link href="/super/organizations" className="mt-3 inline-block text-sm text-primary hover:underline">
            ← Organizations
          </Link>
        </SuperAdminSectionCard>
      </SuperPageWrapper>
    );
  }

  return (
    <SuperPageWrapper
      title={
        <div className="flex flex-wrap items-center gap-3">
          <span>{organization.name}</span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
              planBadgeClass(organization.plan)
            )}
          >
            {organization.plan}
          </span>
        </div>
      }
      action={
        <Link
          href="/super/organizations"
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          ← Organizations
        </Link>
      }
    >
      <SuperAdminSectionCard>
        <div className="mb-6 flex flex-wrap gap-1 rounded-md border border-gray-200 bg-gray-50 p-1">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={`/super/organizations/${organizationId}?tab=${tab.id}`}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {activeTab === "overview" && (
          <OrgOverviewPanel organization={organization} onUpdated={refreshOrganization} />
        )}
        {activeTab === "features" && (
          <OrgFeaturesPanel organization={organization} onSaved={refreshOrganization} />
        )}
        {activeTab === "setup" && (
          <OrgSetupPanel
            key={`${organization._id}-${organization.updatedAt ?? ""}`}
            organizationId={organization._id}
            initialConfig={setupInitialConfig}
            onSaved={refreshOrganization}
          />
        )}
        {activeTab === "branding" && (
          <OrgBrandingPanel
            organizationId={organization._id}
            organizationName={organization.name}
          />
        )}
        {activeTab === "admin" && (
          <OrgAdminPanel organizationId={organization._id} organizationName={organization.name} />
        )}
      </SuperAdminSectionCard>
    </SuperPageWrapper>
  );
};

export default OrganizationDetailPage;
