"use client";

import { Check } from "lucide-react";
import type { JSX } from "react";

import { cn } from "@/lib/utils";

interface BulkProgressStepperProps {
  steps: string[];
  currentStep: number;
}

export const BulkProgressStepper = ({
  steps,
  currentStep
}: BulkProgressStepperProps): JSX.Element => (
  <ol className="flex flex-wrap items-center gap-2">
    {steps.map((label, index) => {
      const stepNo = index + 1;
      const isCompleted = stepNo < currentStep;
      const isActive = stepNo === currentStep;

      return (
        <li key={label} className="flex items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium transition",
              isCompleted && "bg-green-50 text-green-700",
              isActive && "bg-primary text-white",
              !isCompleted && !isActive && "bg-gray-100 text-gray-500"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                isCompleted && "bg-green-600 text-white",
                isActive && "bg-white text-primary",
                !isCompleted && !isActive && "bg-gray-300 text-gray-700"
              )}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : stepNo}
            </span>
            {label}
          </div>
          {index < steps.length - 1 && (
            <span
              className={cn(
                "hidden h-0.5 w-6 sm:block",
                stepNo < currentStep ? "bg-green-500" : "bg-gray-300"
              )}
            />
          )}
        </li>
      );
    })}
  </ol>
);
