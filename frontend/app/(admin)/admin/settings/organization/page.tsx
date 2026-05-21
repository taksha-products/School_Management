"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { ACADEMIC_YEAR } from "@/lib/constants";
import { api } from "@/lib/api";

interface OrganizationSettings {
  _id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  plan: string;
  isActive: boolean;
  currentAcademicYear?: string;
}

const OrganizationSettingsPage = (): JSX.Element => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [academicYear, setAcademicYear] = useState(ACADEMIC_YEAR);

  const orgQuery = useQuery({
    queryKey: ["org-settings"],
    queryFn: async () =>
      (await api.get<{ data: OrganizationSettings }>("/api/org/organization")).data.data
  });

  useEffect(() => {
    if (orgQuery.data?.currentAcademicYear) {
      setAcademicYear(orgQuery.data.currentAcademicYear);
    }
  }, [orgQuery.data?.currentAcademicYear]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      api.patch("/api/org/organization", { currentAcademicYear: academicYear }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-settings"] });
      showToast("success", "Organization settings saved");
    },
    onError: () => showToast("error", "Failed to save settings")
  });

  const org = orgQuery.data;

  return (
    <PageWrapper title="Organization settings">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="School profile">
          {orgQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : org ? (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Name</dt>
                <dd className="font-medium">{org.name}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Code</dt>
                <dd>{org.code}</dd>
              </div>
              {org.email && (
                <div>
                  <dt className="text-slate-500">Email</dt>
                  <dd>{org.email}</dd>
                </div>
              )}
              {org.phone && (
                <div>
                  <dt className="text-slate-500">Phone</dt>
                  <dd>{org.phone}</dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500">Plan</dt>
                <dd className="capitalize">{org.plan}</dd>
              </div>
            </dl>
          ) : null}
        </Card>

        <Card title="Academic year">
          <p className="mb-3 text-sm text-slate-600">
            This year is used as the default on student forms, transport registration, and fee
            collection across the admin portal.
          </p>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Current academic year (YYYY-YY)
          </label>
          <input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="2025-26"
            className="mb-3 w-full rounded border border-slate-200 px-3 py-2"
          />
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save academic year"}
          </Button>
        </Card>
      </div>
    </PageWrapper>
  );
};

export default OrganizationSettingsPage;
