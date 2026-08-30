"use client";

import type { JSX, ReactNode } from "react";

import { OrgThemeProvider } from "@/components/OrgThemeProvider";

const ReceiptLayout = ({ children }: { children: ReactNode }): JSX.Element => (
  <OrgThemeProvider>{children}</OrgThemeProvider>
);

export default ReceiptLayout;
