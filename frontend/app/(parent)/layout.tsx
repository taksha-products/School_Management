"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type JSX, type ReactNode } from "react";

import { OrgThemeProvider } from "@/components/OrgThemeProvider";
import { ParentDesktopHeader } from "@/components/parent/ParentDesktopHeader";
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

  // Stack-style routes hide the mobile tab bar (desktop header stays).
  const hideMobileTabBar =
    pathname.startsWith("/parent/child/") || pathname.startsWith("/parent/receipt/");

  const isLiveBus = pathname.startsWith("/parent/child/") && pathname.endsWith("/bus");

  return (
    <OrgThemeProvider>
      <div className="min-h-screen bg-white text-[#141414] md:bg-[#F7F8F9]">
        <ParentDesktopHeader />
        <main
          className={cn(
            // Phone: app-width column + room for floating tab bar
            "mx-auto w-full max-w-lg px-4 pt-2",
            hideMobileTabBar ? "pb-8" : "pb-36",
            // Desktop: wide content, no bottom-tab padding
            "md:max-w-5xl md:px-6 md:py-8 md:pb-8",
            isLiveBus && "md:max-w-3xl"
          )}
        >
          {children}
        </main>
        {hideMobileTabBar ? null : <ParentTabBar />}
      </div>
    </OrgThemeProvider>
  );
};

export default ParentLayout;
