"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { JSX, FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ResetAdminPasswordModalProps {
  organizationId: string;
  organizationName: string;
  isOpen: boolean;
  onClose: () => void;
}

const validatePassword = (password: string): string | null => {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/\d/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
};

export const ResetAdminPasswordModal = ({
  organizationId,
  organizationName,
  isOpen,
  onClose
}: ResetAdminPasswordModalProps): JSX.Element | null => {
  const { showToast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = (): void => {
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleClose = (): void => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      showToast("error", passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("error", "Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/api/superadmin/organizations/${organizationId}/reset-password`, {
        newPassword
      });
      showToast("success", "Password reset successfully");
      handleClose();
    } catch {
      showToast("error", "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      title={`Reset Password — ${organizationName}`}
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="reset-admin-password-form" disabled={submitting}>
            {submitting ? "Resetting…" : "Reset Password"}
          </Button>
        </>
      }
    >
      <form id="reset-admin-password-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This will log out the admin from all devices.
        </p>

        <div>
          <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-gray-700">
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded border border-gray-200 px-3 py-2 pr-10"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              aria-label={showNewPassword ? "Hide password" : "Show password"}
            >
              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-gray-700">
            Confirm password
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={cn(
                "w-full rounded border px-3 py-2 pr-10",
                confirmPassword.length > 0 && newPassword !== confirmPassword
                  ? "border-red-300"
                  : "border-gray-200"
              )}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
