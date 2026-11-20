"use client";

import type { JSX } from "react";

import { SuperPageWrapper } from "@/components/layout/SuperPageWrapper";
import { SecuritySettings } from "@/components/settings/SecuritySettings";

const SuperSecurityPage = (): JSX.Element => (
  <SuperPageWrapper title="Security" subtitle="Protect your super admin account">
    <SecuritySettings embedded superAdminMandatory />
  </SuperPageWrapper>
);

export default SuperSecurityPage;
