"use client";

import { Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { JSX } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { normalizeBrandColor } from "@/lib/brandColor";
import { DEFAULT_BRAND_COLOR } from "@/types/orgTheme";
import type { OrgTheme } from "@/types/orgTheme";

const ACCEPTED_LOGO_TYPES = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface OrgBrandingFormProps {
  theme: OrgTheme;
  isSaving?: boolean;
  onSave: (payload: { displayName: string; brandColor: string; logoFile: File | null }) => void;
  description?: string;
}

export const OrgBrandingForm = ({
  theme,
  isSaving = false,
  onSave,
  description = "Customize how this school appears to staff and parents in the portal, receipts, and payment screens."
}: OrgBrandingFormProps): JSX.Element => {
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [color, setColor] = useState(DEFAULT_BRAND_COLOR);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const brandColor = normalizeBrandColor(theme.brandColor);
  const displayLabel = theme.displayName?.trim() || theme.orgName;

  useEffect(() => {
    setDisplayName(theme.displayName ?? "");
    setColor(brandColor);
    if (!logoFile) {
      setLogoPreview(theme.logoUrl);
    }
  }, [theme.displayName, theme.logoUrl, brandColor, logoFile]);

  const validateLogo = (file: File): string | null => {
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      return "Logo must be JPG, PNG, SVG, or WebP";
    }
    if (file.size > MAX_LOGO_BYTES) {
      return "Logo must be 2 MB or smaller";
    }
    return null;
  };

  const setSelectedLogo = (file: File): void => {
    const error = validateLogo(file);
    if (error) {
      showToast("error", error);
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedLogo(file);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      setSelectedLogo(file);
    }
  };

  const handleSave = useCallback((): void => {
    onSave({ displayName: displayName.trim(), brandColor: color, logoFile });
  }, [color, displayName, logoFile, onSave]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">{description}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Logo">
          <p className="mb-4 text-sm text-gray-600">
            Upload the school logo (JPG, PNG, SVG, or WebP, max 2 MB). Shown in the sidebar and on
            receipts.
          </p>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                fileInputRef.current?.click();
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 transition ${
              dragOver ? "border-primary bg-primary-50" : "border-gray-200 hover:border-primary"
            }`}
          >
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Logo preview"
                className="mb-3 max-h-16 w-auto object-contain"
              />
            ) : (
              <Upload className="mb-3 h-8 w-8 text-gray-400" />
            )}
            <p className="text-sm font-medium text-gray-700">
              {logoPreview ? "Click or drop to replace logo" : "Click or drag logo here"}
            </p>
            <p className="mt-1 text-xs text-gray-500">Max 2 MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.svg,.webp,image/jpeg,image/png,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </Card>

        <Card title="Display name & color">
          <div className="space-y-4">
            <div>
              <label htmlFor="displayName" className="mb-1 block text-sm font-medium text-gray-700">
                Display name
              </label>
              <input
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={theme.orgName}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Shown to staff and parents instead of the internal organization name ({theme.orgName}
                ).
              </p>
            </div>

            <div>
              <label htmlFor="brandColor" className="mb-1 block text-sm font-medium text-gray-700">
                Brand color
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="brandColor"
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-gray-200 bg-white p-1"
                />
                <input
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="w-28 rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm uppercase"
                  maxLength={7}
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Live preview
              </p>
              <div className="flex items-center gap-3">
                {logoPreview ? (
                  <img src={logoPreview} alt="" className="max-h-8 w-auto object-contain" />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {(displayName.trim() || displayLabel).charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-lg font-bold text-gray-900">
                  {displayName.trim() || theme.orgName}
                </span>
              </div>
              <button
                type="button"
                className="mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: color }}
              >
                Sample button
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save branding"}
        </Button>
      </div>
    </div>
  );
};
