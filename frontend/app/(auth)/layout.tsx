import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign in — EduNex",
  description: "School management platform for students, teachers, and parents."
};

const AuthLayout = ({ children }: { children: ReactNode }): JSX.Element => (
  <div className="h-[100dvh] overflow-hidden font-sans antialiased">{children}</div>
);

export default AuthLayout;
