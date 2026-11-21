"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";

import { BrandLogo } from "@/components/shared/BrandLogo";
import { OrgThemeProvider } from "@/components/OrgThemeProvider";
import { logout, bootstrapSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

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

  const links = [
    { href: "/parent/dashboard", label: "My Children" },
    { href: "/parent/payments", label: "Payment History" }
  ];

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <OrgThemeProvider>
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3">
            <Link href="/parent/dashboard" className="flex min-w-0 items-center">
              <BrandLogo />
            </Link>
            <nav className="flex flex-wrap items-center gap-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition",
                    pathname.startsWith(l.href)
                      ? "bg-primary-50 text-primary"
                      : "text-gray-600 hover:bg-gray-50 hover:text-primary"
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-gray-600 sm:inline">{name}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                {initials}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="text-sm text-gray-500 hover:text-primary"
              >
                Logout
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </div>
    </OrgThemeProvider>
  );
};

export default ParentLayout;
