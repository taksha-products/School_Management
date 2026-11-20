"use client";

import { createContext, useContext, type JSX, type ReactNode } from "react";

interface SuperAdminLayoutContextValue {
  openMobileNav: () => void;
}

const SuperAdminLayoutContext = createContext<SuperAdminLayoutContextValue | null>(null);

export const SuperAdminLayoutProvider = ({
  openMobileNav,
  children
}: {
  openMobileNav: () => void;
  children: ReactNode;
}): JSX.Element => (
  <SuperAdminLayoutContext.Provider value={{ openMobileNav }}>
    {children}
  </SuperAdminLayoutContext.Provider>
);

export const useSuperAdminLayout = (): SuperAdminLayoutContextValue | null =>
  useContext(SuperAdminLayoutContext);
