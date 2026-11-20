"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { TransportFeesView } from "@/components/admin/TransportFeesView";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { SchoolFeesCollectView } from "@/components/school-fees/SchoolFeesCollectView";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useFeesTabBadges } from "@/hooks/useFeesOutstandingBadge";
import { cn } from "@/lib/utils";

const CollectFeesContent = (): JSX.Element => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "transport" ? "transport" : "school";
  const badges = useFeesTabBadges();
  const legacyStudentId = searchParams.get("studentId");

  useEffect(() => {
    if (!legacyStudentId) return;
    router.replace(`/admin/fees/collect/${legacyStudentId}`);
  }, [legacyStudentId, router]);

  const setTab = (next: "school" | "transport"): void => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "transport") {
      params.set("tab", "transport");
    } else {
      params.delete("tab");
    }
    const q = params.toString();
    router.push(q ? `/admin/fees/collect?${q}` : "/admin/fees/collect");
  };

  return (
    <PageWrapper
      title="Collect fees"
      action={
        tab === "school" ? (
          <Link href="/admin/fees/outstanding">
            <Button variant="secondary">Outstanding dues</Button>
          </Link>
        ) : undefined
      }
    >
      <Card compact className="!gap-0">
        <div className="-mx-1 mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setTab("school")}
            className={cn(
              "inline-flex items-center gap-2 rounded-t-md px-4 py-2 text-sm font-medium",
              tab === "school"
                ? "border-b-2 border-amber-500 text-amber-700"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            School fees
            {badges.school > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {badges.school}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab("transport")}
            className={cn(
              "inline-flex items-center gap-2 rounded-t-md px-4 py-2 text-sm font-medium",
              tab === "transport"
                ? "border-b-2 border-amber-500 text-amber-700"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Transport fees
            {badges.transport > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {badges.transport}
              </span>
            )}
          </button>
        </div>

        {legacyStudentId ? (
          <p className="text-sm text-slate-500">Opening student collection...</p>
        ) : tab === "school" ? (
          <SchoolFeesCollectView
            receiptBasePath="/admin/school-fees/receipt"
            historyPath={(id) => `/admin/fees/history?studentId=${id}`}
          />
        ) : (
          <TransportFeesView />
        )}
      </Card>
    </PageWrapper>
  );
};

const CollectFeesPage = (): JSX.Element => (
  <Suspense fallback={<p className="p-6 text-slate-500">Loading fees...</p>}>
    <CollectFeesContent />
  </Suspense>
);

export default CollectFeesPage;
