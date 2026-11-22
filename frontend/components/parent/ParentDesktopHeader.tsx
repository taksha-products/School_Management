"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type JSX } from "react";

import { BrandLogo } from "@/components/shared/BrandLogo";
import { bootstrapSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/parent/dashboard",
    label: "Home",
    match: (p: string) => p === "/parent/dashboard" || p === "/parent"
  },
  {
    href: "/parent/payments",
    label: "Payments",
    match: (p: string) => p.startsWith("/parent/payments")
  },
  {
    href: "/parent/marks",
    label: "Marks",
    match: (p: string) => p.startsWith("/parent/marks")
  },
  {
    href: "/parent/bus",
    label: "Bus",
    match: (p: string) =>
      p.startsWith("/parent/bus") ||
      (p.startsWith("/parent/child/") && p.endsWith("/bus"))
  },
  {
    href: "/parent/account",
    label: "Profile",
    match: (p: string) => p.startsWith("/parent/account")
  }
] as const;

/** Sticky top nav for desktop browser — hidden on phone-sized viewports. */
export const ParentDesktopHeader = (): JSX.Element => {
  const pathname = usePathname();
  const [name, setName] = useState("Parent");

  useEffect(() => {
    void bootstrapSession().then((user) => {
      if (user?.name) {
        setName(user.name);
      }
    });
  }, []);

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 hidden border-b border-gray-200 bg-white/95 backdrop-blur md:block">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/parent/dashboard" className="flex min-w-0 items-center">
          <BrandLogo />
        </Link>

        <nav className="flex items-center gap-1" aria-label="Parent desktop">
          {LINKS.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-3.5 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-primary-50 text-primary"
                    : "text-gray-600 hover:bg-gray-50 hover:text-primary"
                )}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/parent/account"
          className="flex items-center gap-3"
          aria-label="Profile"
        >
          <span className="hidden text-sm text-gray-600 lg:inline">{name}</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
            {initials}
          </span>
        </Link>
      </div>
    </header>
  );
};
