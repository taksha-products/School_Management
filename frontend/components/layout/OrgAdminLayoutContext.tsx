"use client";

import { createContext, useContext, type JSX, type ReactNode } from "react";

interface OrgAdminLayoutContextValue {
  openMobileNav: () => void;
}

const OrgAdminLayoutContext = createContext<OrgAdminLayoutContextValue | null>(null);

export const OrgAdminLayoutProvider = ({
  openMobileNav,
  children
}: {
  openMobileNav: () => void;
  children: ReactNode;
}): JSX.Element => (
  <OrgAdminLayoutContext.Provider value={{ openMobileNav }}>
    {children}
  </OrgAdminLayoutContext.Provider>
);

export const useOrgAdminLayout = (): OrgAdminLayoutContextValue | null =>
  useContext(OrgAdminLayoutContext);
