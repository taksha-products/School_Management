"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { JSX, ReactNode } from "react";

import { bootstrapSession } from "@/lib/auth";

const PrincipalLayout = ({ children }: { children: ReactNode }): JSX.Element => {
  const router = useRouter();

  useEffect(() => {
    void bootstrapSession().then((user) => {
      if (!user) {
        router.replace("/login");
      } else {
        router.replace("/login");
      }
    });
  }, [router]);

  return <>{children}</>;
};

export default PrincipalLayout;
