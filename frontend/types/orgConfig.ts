export type InstitutionType = "school" | "college" | "other";

export type InstitutionTemplateKey =
  | "school_primary"
  | "school_secondary"
  | "school_full"
  | "college_bcom"
  | "college_mba"
  | "college_engineering"
  | "custom";

export interface OrgGradeEntry {
  label: string;
  sections: string[];
}

export interface OrgGradeConfig {
  institutionType: InstitutionType;
  grades: OrgGradeEntry[];
  /** Org's current academic year, e.g. "2026-27". */
  currentAcademicYear?: string;
}

export interface InstitutionTemplate {
  label: string;
  grades: OrgGradeEntry[];
}

export type InstitutionTemplatesMap = Record<InstitutionTemplateKey, InstitutionTemplate>;

export interface OrgConfigUpdatePayload {
  institutionType: InstitutionType;
  grades: OrgGradeEntry[];
}
