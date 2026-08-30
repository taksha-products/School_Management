"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type JSX } from "react";

import { GradeSectionManager } from "@/components/superadmin/GradeSectionManager";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cloneGrades } from "@/hooks/useOrgConfig";
import { api } from "@/lib/api";
import type {
  InstitutionTemplateKey,
  InstitutionTemplatesMap,
  InstitutionType,
  OrgConfigUpdatePayload,
  OrgGradeEntry
} from "@/types/orgConfig";

const INSTITUTION_TYPES: { value: InstitutionType; label: string }[] = [
  { value: "school", label: "School" },
  { value: "college", label: "College" },
  { value: "other", label: "Other" }
];

const DEFAULT_GRADES: OrgGradeEntry[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12"
].map((label) => ({ label, sections: [] }));

interface OrgSetupPanelProps {
  organizationId: string;
  initialConfig: OrgConfigUpdatePayload;
  onSaved: () => void;
}

export const OrgSetupPanel = ({
  organizationId,
  initialConfig,
  onSaved
}: OrgSetupPanelProps): JSX.Element => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<OrgConfigUpdatePayload>(() => ({
    institutionType: initialConfig.institutionType,
    grades:
      initialConfig.grades.length > 0 ? cloneGrades(initialConfig.grades) : cloneGrades(DEFAULT_GRADES)
  }));
  const [selectedTemplate, setSelectedTemplate] = useState<InstitutionTemplateKey | "">("");
  const [managerKey, setManagerKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const templatesQuery = useQuery({
    queryKey: ["institution-templates"],
    queryFn: async () =>
      (
        await api.get<{ data: InstitutionTemplatesMap }>(
          "/api/superadmin/organizations/institution-templates"
        )
      ).data.data
  });

  const handleTemplateChange = (key: InstitutionTemplateKey | ""): void => {
    setSelectedTemplate(key);
    if (!key || key === "custom" || !templatesQuery.data) {
      return;
    }
    const template = templatesQuery.data[key];
    setConfig((prev) => ({
      ...prev,
      grades: cloneGrades(template.grades)
    }));
    setManagerKey((value) => value + 1);
  };

  const handleSave = async (): Promise<void> => {
    const grades = config.grades
      .map((grade) => ({
        label: grade.label.trim(),
        sections: grade.sections.map((section) => section.trim()).filter((section) => section.length > 0)
      }))
      .filter((grade) => grade.label.length > 0);

    if (grades.length === 0) {
      showToast("error", "Add at least one grade label");
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/api/superadmin/organizations/${organizationId}/config`, {
        institutionType: config.institutionType,
        grades
      });
      showToast("success", "Organization setup saved");
      onSaved();
    } catch {
      showToast("error", "Failed to save organization setup");
    } finally {
      setSaving(false);
    }
  };

  const templateOptions = templatesQuery.data
    ? (Object.entries(templatesQuery.data) as [InstitutionTemplateKey, { label: string }][])
    : [];

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-900">Institution type</legend>
        <div className="flex flex-wrap gap-4">
          {INSTITUTION_TYPES.map((type) => (
            <label key={type.value} className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="institutionType"
                checked={config.institutionType === type.value}
                onChange={() =>
                  setConfig((prev) => ({ ...prev, institutionType: type.value }))
                }
              />
              {type.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-900">Quick template</label>
        <select
          value={selectedTemplate}
          onChange={(e) => handleTemplateChange(e.target.value as InstitutionTemplateKey | "")}
          disabled={templatesQuery.isLoading}
          className="w-full max-w-md rounded border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="">Choose a template (optional)</option>
          {templateOptions.map(([key, template]) => (
            <option key={key} value={key}>
              {template.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-gray-900">Grade &amp; section manager</p>
        <GradeSectionManager
          key={managerKey}
          grades={config.grades}
          onChange={(grades) => setConfig((prev) => ({ ...prev, grades }))}
        />
      </div>

      <Button onClick={() => void handleSave()} disabled={saving}>
        {saving ? "Saving…" : "Save setup"}
      </Button>
    </div>
  );
};
