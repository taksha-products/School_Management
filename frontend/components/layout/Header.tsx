"use client";

import { Bell, Calendar, ChevronDown, LogOut } from "lucide-react";
import { useEffect, useRef, useState, type JSX } from "react";

import { getUser, logout } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface HeaderProps {
  portalLabel?: string;
  welcomeName?: string;
}

const initials = (name: string): string =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const Header = ({ portalLabel, welcomeName }: HeaderProps): JSX.Element => {
  const user = getUser();
  const name = welcomeName ?? user?.name ?? "User";
  const role = user?.role ?? "";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const monthLabel = new Date().toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="min-w-0">
        {portalLabel && (
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {portalLabel}
          </p>
        )}
        <p className="truncate text-sm text-gray-500">
          Welcome back, <span className="font-medium text-gray-700">{name}</span>.
          Here&apos;s what&apos;s happening today.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 sm:flex"
        >
          <Calendar className="h-4 w-4 text-gray-500" />
          {monthLabel}
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>

        <button
          type="button"
          className="relative rounded-lg p-2 text-gray-500 transition hover:bg-gray-50 hover:text-primary"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-gray-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
              {initials(name)}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-md">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">{name}</p>
                {role && (
                  <p className="mt-0.5 text-xs capitalize text-gray-500">{role.replace(/([A-Z])/g, " $1").trim()}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
