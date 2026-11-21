"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export interface ParentAccountInfo {
  created: boolean;
  name: string;
  phone: string;
  email: string;
  temporaryPassword?: string;
}

interface ParentAccountCreatedModalProps {
  info: ParentAccountInfo | null;
  onClose: () => void;
}

/**
 * Confirms automatic parent account provisioning.
 * Parents authenticate with mobile OTP only — never email/password.
 */
export const ParentAccountCreatedModal = ({
  info,
  onClose
}: ParentAccountCreatedModalProps): JSX.Element => {
  if (!info?.created) {
    return <></>;
  }

  return (
    <Modal isOpen onClose={onClose} title="Parent account created">
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          A parent login was created for <span className="font-semibold">{info.name}</span>.
        </p>
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-6">
          <p>Mobile (OTP login): {info.phone}</p>
        </div>
        <p className="text-xs text-slate-500">
          Parents sign in at <span className="font-medium">/parent/login</span> with this mobile
          number and OTP only. Email/password is not available for parents.
        </p>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
};
