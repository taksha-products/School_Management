"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";
import { Building2, LayoutDashboard, Shield, Users } from "lucide-react";

import { SuperAdminLayoutProvider } from "@/components/layout/SuperAdminLayoutContext";
import { SuperAdminSidebar } from "@/components/layout/SuperAdminSidebar";
import { SuperAdminTwoFactorGate } from "@/components/superadmin/SuperAdminTwoFactorGate";
import type { NavEntry } from "@/components/layout/Sidebar";
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <SuperAdminLayoutProvider openMobileNav={() => setMobileNavOpen(true)}>
      <div className="flex h-screen overflow-hidden bg-white">
        <SuperAdminSidebar
          items={superNav}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main className="min-h-0 flex-1 overflow-y-auto bg-white">
            <SuperAdminTwoFactorGate>{children}</SuperAdminTwoFactorGate>
          </main>
        </div>
      </div>
    </SuperAdminLayoutProvider>
  );
};

export default SuperLayout;

