"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldCheck, ShieldOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type JSX } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { SuperAdminSectionCard } from "@/components/superadmin/SuperAdminSectionCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TwoFactorStatusResponse {
  success?: boolean;
  enabled: boolean;
  verifiedAt: string | null;
  backupCodesRemaining: number;
  needsSetup?: boolean;
  needsReverify?: boolean;
}

interface SetupResponse {
  qrCode: string;
  manualEntryKey: string;
}

const formatDate = (value: string | null): string => {
  if (!value) {
    return "Never";
  }
  return new Date(value).toLocaleString();
};

/**
 * Shared 2FA security settings panel for org admin and super admin portals.
 */
interface SecuritySettingsProps {
  /** When true, omit outer page title wrapper (e.g. super admin uses SuperPageWrapper). */
  embedded?: boolean;
  /** Super admins must keep 2FA enabled; hides disable and shows mandatory messaging. */
  superAdminMandatory?: boolean;
}

export const SecuritySettings = ({
  embedded = false,
  superAdminMandatory = false
}: SecuritySettingsProps): JSX.Element => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [setupOpen, setSetupOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const statusQuery = useQuery({
    queryKey: ["2fa-status"],
    queryFn: async (): Promise<TwoFactorStatusResponse> => {
      const response = await api.get<TwoFactorStatusResponse>("/api/auth/2fa/status");
      return response.data;
    },
    retry: false
  });

  const setupMutation = useMutation({
    mutationFn: async (): Promise<SetupResponse> => {
      const response = await api.post("/api/auth/2fa/setup");
      return response.data as SetupResponse;
    },
    onSuccess: (data) => {
      setQrCode(data.qrCode);
      setManualKey(data.manualEntryKey);
      setConfirmCode("");
      setSetupOpen(true);
    },
    onError: () => {
      showToast("error", "Could not start 2FA setup. Please try again.");
    }
  });

  const confirmMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await api.post("/api/auth/2fa/confirm", { code });
      return response.data as { backupCodes: string[] };
    },
    onSuccess: (data) => {
      setSetupOpen(false);
      setBackupCodes(data.backupCodes);
      setBackupOpen(true);
      void queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
      showToast("success", "Two-factor authentication enabled");
    },
    onError: () => {
      showToast("error", "Invalid code, please try again");
    }
  });

  const disableMutation = useMutation({
    mutationFn: async (payload: { code: string; password: string }) => {
      await api.post("/api/auth/2fa/disable", payload);
    },
    onSuccess: () => {
      setDisableOpen(false);
      setDisablePassword("");
      setDisableCode("");
      void queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
      showToast("success", "Two-factor authentication disabled");
    },
    onError: (error: unknown) => {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === "2FA_DISABLED_FOR_SUPERADMIN") {
        showToast("error", "Super admin accounts cannot disable 2FA");
        return;
      }
      showToast("error", "Invalid password or verification code");
    }
  });

  const status = statusQuery.data;
  const enabled = status?.enabled ?? false;
  const setupRequired = superAdminMandatory && (status?.needsSetup ?? !enabled);

  const autoSetupStarted = useRef(false);

  useEffect(() => {
    if (
      autoSetupStarted.current ||
      !setupRequired ||
      enabled ||
      setupMutation.isPending ||
      setupOpen
    ) {
      return;
    }

    const shouldAutoStart =
      searchParams.get("required") === "setup" || superAdminMandatory;

    if (shouldAutoStart) {
      autoSetupStarted.current = true;
      setupMutation.mutate();
    }
  }, [
    setupRequired,
    enabled,
    setupMutation.isPending,
    setupOpen,
    searchParams,
    superAdminMandatory,
    setupMutation
  ]);

  const SettingsCard = embedded ? SuperAdminSectionCard : Card;
  const cardClassName = embedded ? "max-w-3xl" : "max-w-2xl p-6";

  const panel = (
    <>
      {setupRequired && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Two-factor authentication is mandatory for super admin accounts. Enable it below to
          access the rest of the portal.
        </div>
      )}

      <SettingsCard className={cardClassName}>
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-md",
              enabled ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
            )}
          >
            {enabled ? <ShieldCheck className="h-6 w-6" /> : <Shield className="h-6 w-6" />}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Two-factor authentication</h2>
            <p className="mt-1 text-sm text-gray-600">
              Add an extra layer of security using Google Authenticator, Authy, or any TOTP app.
            </p>

            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <p>
                <span className="font-medium">Status:</span>{" "}
                {enabled ? (
                  <span className="text-emerald-600">Enabled</span>
                ) : (
                  <span className="text-amber-600">Not enabled</span>
                )}
              </p>
              {enabled && (
                <>
                  <p>
                    <span className="font-medium">Last verified:</span>{" "}
                    {formatDate(status?.verifiedAt ?? null)}
                  </p>
                  <p>
                    <span className="font-medium">Backup codes remaining:</span>{" "}
                    {status?.backupCodesRemaining ?? 0}
                  </p>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {!enabled ? (
                <Button
                  onClick={() => setupMutation.mutate()}
                  disabled={setupMutation.isPending}
                >
                  {setupMutation.isPending ? "Preparing..." : "Enable 2FA"}
                </Button>
              ) : !superAdminMandatory ? (
                <Button variant="secondary" onClick={() => setDisableOpen(true)}>
                  <ShieldOff className="mr-2 h-4 w-4" />
                  Disable 2FA
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </SettingsCard>

      <Modal
        isOpen={setupOpen}
        title="Set up authenticator app"
        onClose={() => setSetupOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSetupOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmMutation.mutate(confirmCode)}
              disabled={confirmCode.length < 6 || confirmMutation.isPending}
            >
              {confirmMutation.isPending ? "Verifying..." : "Confirm"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
          </p>
          {qrCode && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="2FA QR code" className="h-48 w-48 rounded-lg border" />
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Manual entry key
            </p>
            <p className="mt-1 break-all rounded-lg bg-gray-50 p-3 font-mono text-sm text-gray-800">
              {manualKey}
            </p>
          </div>
          <div>
            <label className="form-label" htmlFor="confirm-2fa-code">
              Verification code
            </label>
            <input
              id="confirm-2fa-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="form-input"
              placeholder="000000"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={backupOpen}
        title="Save your backup codes"
        onClose={() => setBackupOpen(false)}
        footer={
          <Button
            onClick={() => {
              setBackupOpen(false);
              setBackupCodes([]);
            }}
          >
            I have saved these codes
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            These backup codes are shown <strong>once</strong>. Store them in a safe place. Each code
            can only be used one time.
          </p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
            {backupCodes.map((code) => (
              <li key={code} className="rounded bg-gray-50 px-3 py-2 text-center">
                {code}
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <Modal
        isOpen={disableOpen}
        title="Disable two-factor authentication"
        onClose={() => setDisableOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisableOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                disableMutation.mutate({ code: disableCode, password: disablePassword })
              }
              disabled={
                disableMutation.isPending || disableCode.length < 6 || disablePassword.length < 6
              }
            >
              {disableMutation.isPending ? "Disabling..." : "Disable 2FA"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter your password and a current authenticator code to disable 2FA.
          </p>
          <div>
            <label className="form-label" htmlFor="disable-password">
              Password
            </label>
            <input
              id="disable-password"
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label" htmlFor="disable-code">
              Authenticator code
            </label>
            <input
              id="disable-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="form-input"
              placeholder="000000"
            />
          </div>
        </div>
      </Modal>
    </>
  );

  if (embedded) {
    return panel;
  }

  return <PageWrapper title="Security">{panel}</PageWrapper>;
};
