"use client";

import { Suspense } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { SchoolFeesCollectView } from "@/components/school-fees/SchoolFeesCollectView";
import { canDo } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const StaffSchoolFeesPage = (): JSX.Element => {
  const router = useRouter();
  useEffect(() => {
    if (!canDo("canCollectFees")) router.replace("/staff/dashboard");
  }, [router]);

  return (
    <PageWrapper title="Collect School Fees">
      <Suspense fallback={<p className="text-slate-500">Loading...</p>}>
        <SchoolFeesCollectView receiptBasePath="/staff/school-fees/receipt" />
      </Suspense>
    </PageWrapper>
  );
};

export default StaffSchoolFeesPage;
