"use client";

import { useMutation } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useState, type JSX } from "react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SuperAdminReverifyPanelProps {
  onVerified: () => void;
}

export const SuperAdminReverifyPanel = ({ onVerified }: SuperAdminReverifyPanelProps): JSX.Element => {
  const { showToast } = useToast();
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  const reverifyMutation = useMutation({
    mutationFn: async (verificationCode: string) => {
      await api.post("/api/auth/2fa/reverify", { code: verificationCode });
    },
    onSuccess: () => {
      setCode("");
      showToast("success", "Two-factor verification renewed");
      onVerified();
    },
    onError: (error: unknown) => {
      const responseCode = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (responseCode === "2FA_RATE_LIMITED") {
        showToast("error", "Too many attempts. Please wait and try again.");
        return;
      }
      showToast("error", "Invalid verification code");
    }
  });

  const trimmedCode = code.trim();
  const canSubmit = useBackupCode ? trimmedCode.length >= 8 : /^\d{6}$/.test(trimmedCode);

  return (
    <div className="flex min-h-[420px] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Verify your identity</h2>
            <p className="mt-1 text-sm text-gray-600">
              Your 2FA session expired after 24 hours. Enter a code from your authenticator app to
              continue using the super admin portal.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="form-label" htmlFor="reverify-code">
              {useBackupCode ? "Backup code" : "Authenticator code"}
            </label>
            <input
              id="reverify-code"
              type="text"
              inputMode={useBackupCode ? "text" : "numeric"}
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => {
                const next = useBackupCode
                  ? event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "")
                  : event.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(next);
              }}
              className="form-input"
              placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setUseBackupCode((current) => !current);
              setCode("");
            }}
            className="text-sm font-medium text-primary hover:underline"
          >
            {useBackupCode ? "Use authenticator app instead" : "Use a backup code instead"}
          </button>

          <Button
            className={cn("w-full")}
            onClick={() => reverifyMutation.mutate(trimmedCode)}
            disabled={!canSubmit || reverifyMutation.isPending}
          >
            {reverifyMutation.isPending ? "Verifying..." : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
};
