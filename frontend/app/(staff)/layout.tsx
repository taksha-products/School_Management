"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { getStaffNavItems } from "@/components/layout/staffNav";
import { OrgThemeProvider } from "@/components/OrgThemeProvider";
import { bootstrapSession } from "@/lib/auth";

const StaffLayout = ({ children }: { children: ReactNode }): JSX.Element => {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void bootstrapSession().then((user) => {
      if (!user || user.role !== "staff") {
        router.replace("/login");
        return;
      }
      setReady(true);
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <OrgThemeProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar legacyItems={getStaffNavItems()} whiteLabel roleBadge="Staff" />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Header portalLabel="Staff Portal" />
          <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50">{children}</main>
        </div>
      </div>
    </OrgThemeProvider>
  );
};

export default StaffLayout;
