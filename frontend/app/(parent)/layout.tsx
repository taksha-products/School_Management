"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type JSX, type ReactNode } from "react";

import { OrgThemeProvider } from "@/components/OrgThemeProvider";
import { ParentTabBar } from "@/components/parent/ParentTabBar";
import { bootstrapSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

const ParentLayout = ({ children }: { children: ReactNode }): JSX.Element => {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    void bootstrapSession().then((user) => {
      if (!user || user.role !== "parent") {
        router.replace("/parent/login");
      }
    });
  }, [router]);

  // Stack-style routes (child fees, live bus, receipt) hide the tab bar — same as mobile.
  const hideTabBar =
    pathname.startsWith("/parent/child/") || pathname.startsWith("/parent/receipt/");

  return (
    <OrgThemeProvider>
      <div className="min-h-screen bg-white text-[#141414]">
        <main
          className={cn(
            "mx-auto w-full max-w-lg px-4 pt-2",
            hideTabBar ? "pb-8" : "pb-36"
          )}
        >
          {children}
        </main>
        {hideTabBar ? null : <ParentTabBar />}
      </div>
    </OrgThemeProvider>
  );
};

export default ParentLayout;
