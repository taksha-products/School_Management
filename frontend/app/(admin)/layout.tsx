"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { adminNav } from "@/components/layout/adminNav";
import { getUser, getToken } from "@/lib/auth";

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps): JSX.Element => {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || user?.role !== "orgAdmin") {
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
      <Sidebar items={adminNav} brand="BusTrack" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header portalLabel="Organization Admin" />
        <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;
