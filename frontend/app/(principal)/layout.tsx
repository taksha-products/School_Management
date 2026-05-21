"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { JSX, ReactNode } from "react";

import { getToken } from "@/lib/auth";

const PrincipalLayout = ({ children }: { children: ReactNode }): JSX.Element => {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return <>{children}</>;
};

export default PrincipalLayout;
