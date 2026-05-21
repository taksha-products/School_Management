import type { ButtonHTMLAttributes, JSX } from "react";

import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-[15px]"
};

const variantClasses = {
  primary:
    "bg-primary text-white shadow-sm hover:bg-primary-hover font-medium",
  secondary:
    "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium",
  ghost: "bg-transparent text-gray-500 hover:text-primary font-medium",
  danger: "bg-red-600 text-white hover:bg-red-700 font-medium"
};

export const Button = ({
  children,
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps): JSX.Element => (
  <button
    className={cn(
      "inline-flex cursor-pointer items-center justify-center rounded-md transition-all duration-150 ease-in-out",
      "disabled:cursor-not-allowed disabled:opacity-50",
      sizeClasses[size],
      variantClasses[variant],
      className
    )}
    {...props}
  >
    {children}
  </button>
);
