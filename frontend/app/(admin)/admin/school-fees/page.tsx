"use client";

import { Suspense } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { SchoolFeesCollectView } from "@/components/school-fees/SchoolFeesCollectView";

const SchoolFeesPage = (): JSX.Element => (
  <PageWrapper title="Collect School Fees">
    <Suspense fallback={<p className="text-slate-500">Loading...</p>}>
      <SchoolFeesCollectView
        receiptBasePath="/admin/school-fees/receipt"
        historyPath={(id) => `/admin/school-fees/history/${id}`}
      />
    </Suspense>
  </PageWrapper>
);

export default SchoolFeesPage;
