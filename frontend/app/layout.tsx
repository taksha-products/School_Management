import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import type { JSX, ReactNode } from "react";

import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

const dmSans = DM_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BusTrack",
  description: "School bus management system"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>): JSX.Element {
  return (
    <html lang="en">
      <body className={dmSans.className}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
