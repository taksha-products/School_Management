"use client";

import type { JSX } from "react";

import { BusesManageView } from "@/components/admin/BusesManageView";
import { PageWrapper } from "@/components/layout/PageWrapper";

const BusesPage = (): JSX.Element => (
  <PageWrapper title="Buses">
    <BusesManageView />
  </PageWrapper>
);

export default BusesPage;
