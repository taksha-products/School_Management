"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";
import { Building2, LayoutDashboard, Shield, Users } from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Sidebar, type NavEntry } from "@/components/layout/Sidebar";
import { bootstrapSession } from "@/lib/auth";

const superNav: NavEntry[] = [
  { href: "/super/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/super/organizations", label: "Organizations", icon: Building2 },
  { href: "/super/users", label: "All Users", icon: Users },
  { href: "/super/settings/security", label: "Security", icon: Shield }
];

const SuperLayout = ({ children }: { children: ReactNode }): JSX.Element => {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void bootstrapSession().then((user) => {
      if (!user || user.role !== "superAdmin") {
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
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar legacyItems={superNav} brand="TAKSHA" roleBadge="Super Admin" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header portalLabel="Super Admin" />
        <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50">{children}</main>
      </div>
    </div>
  );
};

export default SuperLayout;
