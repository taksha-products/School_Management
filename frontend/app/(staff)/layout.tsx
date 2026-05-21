"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { getStaffNavItems } from "@/components/layout/staffNav";
import { getToken, getUser } from "@/lib/auth";

const StaffLayout = ({ children }: { children: ReactNode }): JSX.Element => {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || user?.role !== "staff") {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar legacyItems={getStaffNavItems()} brand="BusTrack Staff" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header portalLabel="Staff Portal" />
        <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50">{children}</main>
      </div>
    </div>
  );
};

export default StaffLayout;
