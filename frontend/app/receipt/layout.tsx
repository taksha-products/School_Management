"use client";

import { useEffect, type JSX, type ReactNode } from "react";

import { OrgThemeProvider } from "@/components/OrgThemeProvider";
import { bootstrapSession } from "@/lib/auth";

const ReceiptLayout = ({ children }: { children: ReactNode }): JSX.Element => {
  useEffect(() => {
    void bootstrapSession();
  }, []);

  return <OrgThemeProvider>{children}</OrgThemeProvider>;
};

export default ReceiptLayout;
