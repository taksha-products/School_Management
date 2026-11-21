"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";

import { BrandLogo } from "@/components/shared/BrandLogo";
import { OrgThemeProvider } from "@/components/OrgThemeProvider";
import { bootstrapSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

const links = [
  { href: "/parent/dashboard", label: "Home", match: "/parent/dashboard" },
  { href: "/parent/payments", label: "Payments", match: "/parent/payments" },
  { href: "/parent/bus", label: "Bus", match: "/parent/bus" },
  { href: "/parent/account", label: "Profile", match: "/parent/account" }
] as const;

const ParentLayout = ({ children }: { children: ReactNode }): JSX.Element => {
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("Parent");

  useEffect(() => {
    void bootstrapSession().then((user) => {
      if (!user || user.role !== "parent") {
        router.replace("/parent/login");
        return;
      }
      setName(user.name);
    });
  }, [router]);

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isChildOrReceipt =
    pathname.startsWith("/parent/child/") || pathname.startsWith("/parent/receipt/");

  return (
    <OrgThemeProvider>
      <div className="min-h-screen bg-[#F7F8F9]">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3">
            <Link href="/parent/dashboard" className="flex min-w-0 items-center">
              <BrandLogo />
            </Link>
            <nav className="flex flex-wrap items-center gap-1">
              {links.map((l) => {
                const active = pathname === l.match || pathname.startsWith(`${l.match}/`);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "rounded-full px-3.5 py-2 text-sm font-semibold transition",
                      active
                        ? "bg-primary-50 text-primary"
                        : "text-gray-600 hover:bg-gray-50 hover:text-primary"
                    )}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-3">
              <Link
                href="/parent/account"
                className="hidden text-sm text-gray-600 hover:text-primary sm:inline"
              >
                {name}
              </Link>
              <Link
                href="/parent/account"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white"
                aria-label="Profile"
              >
                {initials}
              </Link>
            </div>
          </div>
        </header>
        <main
          className={cn(
            "mx-auto max-w-5xl px-6 py-8",
            isChildOrReceipt && "pt-6"
          )}
        >
          {children}
        </main>
      </div>
    </OrgThemeProvider>
  );
};

export default ParentLayout;
