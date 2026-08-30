"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { adminNav } from "@/components/layout/adminNav";
import { OrgThemeProvider } from "@/components/OrgThemeProvider";
import { bootstrapSession } from "@/lib/auth";

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps): JSX.Element => {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    void bootstrapSession().then((user) => {
      if (!user || user.role !== "orgAdmin") {
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
        <Sidebar
          items={adminNav}
          whiteLabel
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Header
            portalLabel="Organization Admin"
            onMenuClick={() => setMobileNavOpen(true)}
          />
          <main className="min-h-0 flex-1 overflow-y-auto bg-gray-50">{children}</main>
        </div>
      </div>
    </OrgThemeProvider>
  );
};

export default AdminLayout;
