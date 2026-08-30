import {
  DEFAULT_GRADE_LABELS,
  DEFAULT_SECTION_LABELS,
  type InstitutionType
} from "../constants/institutionTemplates";
import type { IOrganization, OrgGradeEntry } from "../models/Organization";

export type { OrgGradeEntry };

export interface OrgGradeConfig {
  institutionType: InstitutionType;
  grades: OrgGradeEntry[];
}

type LegacyOrgGradeFields = {
  gradeLabels?: string[];
  hasSections?: boolean;
  sectionLabels?: string[];
};

type OrgGradeConfigSource = Pick<IOrganization, "institutionType" | "grades"> & LegacyOrgGradeFields;

export const DEFAULT_GRADES: OrgGradeEntry[] = DEFAULT_GRADE_LABELS.map((label) => ({
  label,
  sections: []
}));

const normalizeGradeEntry = (entry: OrgGradeEntry): OrgGradeEntry => ({
  label: entry.label.trim(),
  sections: entry.sections.map((section) => section.trim()).filter((section) => section.length > 0)
});

const resolveGradesFromLegacyFields = (org: LegacyOrgGradeFields): OrgGradeEntry[] | null => {
  if (!Array.isArray(org.gradeLabels) || org.gradeLabels.length === 0) {
    return null;
  }

  const sections =
    org.hasSections && Array.isArray(org.sectionLabels) && org.sectionLabels.length > 0
      ? org.sectionLabels
      : org.hasSections
        ? [...DEFAULT_SECTION_LABELS]
        : [];

  return org.gradeLabels.map((label) => ({
    label: label.trim(),
    sections: sections.map((section) => section.trim()).filter((section) => section.length > 0)
  }));
};

export const resolveOrgGradeConfig = (org: OrgGradeConfigSource): OrgGradeConfig => {
  let grades: OrgGradeEntry[];

  if (Array.isArray(org.grades) && org.grades.length > 0) {
    grades = org.grades.map(normalizeGradeEntry);
  } else {
    const legacyGrades = resolveGradesFromLegacyFields(org);
    grades = legacyGrades ?? DEFAULT_GRADES;
  }

  return {
    institutionType: org.institutionType ?? "school",
    grades
  };
};

export const getGradeLabels = (config: OrgGradeConfig): string[] =>
  config.grades.map((grade) => grade.label);

export const getSectionsForGrade = (config: OrgGradeConfig, gradeLabel: string): string[] =>
  config.grades.find((grade) => grade.label === gradeLabel)?.sections ?? [];

export const orgHasAnySections = (config: OrgGradeConfig): boolean =>
  config.grades.some((grade) => grade.sections.length > 0);

export const buildValidGradeSet = (grades: OrgGradeEntry[]): Set<string> =>
  new Set(grades.map((grade) => grade.label.trim()).filter((label) => label.length > 0));

export const formatGradeValidationMessage = (grades: OrgGradeEntry[]): string =>
  `Grade must be one of: ${getGradeLabels({ institutionType: "school", grades }).join(", ")}`;

export const formatSectionValidationMessage = (sections: string[]): string =>
  `Section must be one of: ${sections.join(", ")}`;
