import { X } from "lucide-react";
import type { JSX, ReactNode } from "react";

import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: "default" | "large";
}

export const Modal = ({
  isOpen,
  title,
  children,
  onClose,
  footer,
  size = "default"
}: ModalProps): JSX.Element | null => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "w-full rounded-2xl bg-white p-6 text-gray-900 shadow-[0_20px_60px_rgb(0_0_0/0.15)]",
          size === "large" ? "max-w-[600px]" : "max-w-[480px]"
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 transition hover:text-gray-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div>{children}</div>
        {footer !== undefined ? (
          <div className="mt-4 flex justify-end gap-2.5 border-t border-gray-100 pt-4">
            {footer}
          </div>
        ) : (
          <div className="mt-4 flex justify-end border-t border-gray-100 pt-4">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
