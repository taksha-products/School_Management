import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";

import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

export const metadata: Metadata = {
  title: "TAKSHA",
  description: "School management platform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>): JSX.Element {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
