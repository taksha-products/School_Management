import type { HTMLAttributes, JSX, ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface SuperAdminSectionCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const SuperAdminSectionCard = ({
  children,
  className,
  ...props
}: SuperAdminSectionCardProps): JSX.Element => (
  <Card className={cn("rounded-md border-gray-200 p-5 shadow-sm md:p-6", className)} {...props}>
    {children}
  </Card>
);
