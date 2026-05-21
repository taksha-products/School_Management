"use client";

import { BusesManageView } from "@/components/admin/BusesManageView";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { TransportSubNav } from "@/components/layout/TransportSubNav";

const TransportBusesPage = (): JSX.Element => (
  <PageWrapper title="Transport">
    <TransportSubNav />
    <BusesManageView />
  </PageWrapper>
);

export default TransportBusesPage;
