"use client";

import { TransportFeesView } from "@/components/admin/TransportFeesView";
import { PageWrapper } from "@/components/layout/PageWrapper";

const FeesPage = (): JSX.Element => (
  <PageWrapper title="Fees">
    <TransportFeesView />
  </PageWrapper>
);

export default FeesPage;
