"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JSX } from "react";

import { cn } from "@/lib/utils";

const tabs = [
  { label: "Buses", href: "/admin/transport/buses" },
  { label: "Student transport", href: "/admin/transport/students" },
  { label: "Expenses", href: "/admin/transport/expenses" }
] as const;

export const TransportSubNav = (): JSX.Element => {
  const pathname = usePathname();

  return (
    <nav className="mb-4 flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary-50 text-primary"
                : "bg-gray-100 text-gray-600 hover:bg-gray-50 hover:text-primary"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
};
