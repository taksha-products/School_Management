"use client";

import { ExpensesManageView } from "@/components/admin/ExpensesManageView";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { TransportSubNav } from "@/components/layout/TransportSubNav";

const TransportExpensesPage = (): JSX.Element => (
  <PageWrapper title="Transport">
    <TransportSubNav />
    <ExpensesManageView />
  </PageWrapper>
);

export default TransportExpensesPage;
