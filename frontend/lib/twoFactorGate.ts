export const SUPER_ADMIN_2FA_GATE_EVENT = "superadmin:2fa-gate";

export type SuperAdminTwoFactorGateCode = "2FA_REQUIRED" | "2FA_SETUP_REQUIRED";

export interface TwoFactorStatus {
  enabled: boolean;
  verifiedAt: string | null;
  backupCodesRemaining: number;
  needsSetup: boolean;
  needsReverify: boolean;
}

export interface TwoFactorStatusResponse extends TwoFactorStatus {
  success?: boolean;
}

export const SUPER_ADMIN_SECURITY_PATH = "/super/settings/security";

export const dispatchSuperAdminTwoFactorGate = (code: SuperAdminTwoFactorGateCode): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(SUPER_ADMIN_2FA_GATE_EVENT, {
      detail: { code }
    })
  );
};

export const isSuperAdminSecurityPath = (pathname: string): boolean =>
  pathname.startsWith(SUPER_ADMIN_SECURITY_PATH);
