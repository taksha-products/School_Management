"use client";

import Link from "next/link";
import { Settings, Shield, UserCog, UsersRound } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";

const cards = [
  {
    title: "Staff accounts",
    description: "Manage staff logins and permissions for fee collection, students, buses, and reports.",
    href: "/admin/settings/staff",
    icon: UserCog
  },
  {
    title: "Parent accounts",
    description: "Link parents to students and manage parent portal access.",
    href: "/admin/settings/parents",
    icon: UsersRound
  },
  {
    title: "Organization",
    description: "School profile, plan, and default academic year for forms across the app.",
    href: "/admin/settings/organization",
    icon: Settings
  },
  {
    title: "Security",
    description: "Two-factor authentication, backup codes, and account protection.",
    href: "/admin/settings/security",
    icon: Shield
  }
] as const;

const SettingsHubPage = (): JSX.Element => (
  <PageWrapper title="Settings">
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <Link key={card.href} href={card.href}>
          <Card className="h-full transition-shadow hover:shadow-md">
            <card.icon className="mb-3 h-8 w-8 text-amber-600" />
            <h2 className="text-lg font-semibold text-slate-900">{card.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{card.description}</p>
          </Card>
        </Link>
      ))}
    </div>
  </PageWrapper>
);

export default SettingsHubPage;
