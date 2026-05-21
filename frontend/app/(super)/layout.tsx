"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";
import { Building2, LayoutDashboard, Users } from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Sidebar, type NavEntry } from "@/components/layout/Sidebar";
import { getToken, getUser } from "@/lib/auth";

const superNav: NavEntry[] = [
  { href: "/super/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/super/organizations", label: "Organizations", icon: Building2 },
  { href: "/super/users", label: "All Users", icon: Users }
];

const SuperLayout = ({ children }: { children: ReactNode }): JSX.Element => {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || user?.role !== "superAdmin") {
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
      <Sidebar legacyItems={superNav} brand="BusTrack" roleBadge="Super Admin" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header portalLabel="Super Admin" />
        <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50">{children}</main>
      </div>
    </div>
  );
};

export default SuperLayout;
