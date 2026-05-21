"use client";

import type { JSX } from "react";

import { ExpensesManageView } from "@/components/admin/ExpensesManageView";
import { PageWrapper } from "@/components/layout/PageWrapper";

const ExpensesPage = (): JSX.Element => (
  <PageWrapper title="Expenses">
    <ExpensesManageView />
  </PageWrapper>
);

export default ExpensesPage;
