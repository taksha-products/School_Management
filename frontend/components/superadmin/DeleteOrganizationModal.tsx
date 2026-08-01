"use client";

import { useEffect, useState } from "react";
import type { JSX, FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { Organization } from "@/types/schoolFees";

interface DeleteOrganizationModalProps {
  organization: Organization | null;
  isOpen: boolean;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteOrganizationModal = ({
  organization,
  isOpen,
  deleting,
  onClose,
  onConfirm
}: DeleteOrganizationModalProps): JSX.Element | null => {
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setConfirmName("");
    }
  }, [isOpen]);

  if (!isOpen || !organization) {
    return null;
  }

  const nameMatches = confirmName === organization.name;

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (!nameMatches || deleting) {
      return;
    }
    onConfirm();
  };

  return (
    <Modal
      isOpen={isOpen}
      title={`Delete ${organization.name}?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="submit"
            form="delete-organization-form"
            disabled={!nameMatches || deleting}
          >
            {deleting ? "Deleting…" : "Delete organization"}
          </Button>
        </>
      }
    >
      <form id="delete-organization-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">
          This will deactivate the organization and all its staff accounts. This action cannot be
          undone.
        </p>
        <div>
          <label htmlFor="confirm-org-name" className="mb-1 block text-sm font-medium text-gray-700">
            Type <span className="font-semibold text-gray-900">{organization.name}</span> to confirm
          </label>
          <input
            id="confirm-org-name"
            type="text"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            className="w-full rounded border border-gray-200 px-3 py-2"
            autoComplete="off"
            placeholder={organization.name}
          />
        </div>
      </form>
    </Modal>
  );
};
