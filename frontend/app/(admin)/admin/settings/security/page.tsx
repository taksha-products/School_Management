"use client";

import type { JSX } from "react";

import { SecuritySettings } from "@/components/settings/SecuritySettings";

// Next.js pages may only receive route props, so wrap the component
// instead of re-exporting it (its `embedded` prop breaks `next build`).
const AdminSecuritySettingsPage = (): JSX.Element => <SecuritySettings />;

export default AdminSecuritySettingsPage;
