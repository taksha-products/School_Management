import type { OrgGradeEntry } from "../models/Organization";

export type InstitutionType = "school" | "college" | "other";

export type InstitutionTemplateKey =
  | "school_primary"
  | "school_secondary"
  | "school_full"
  | "college_bcom"
  | "college_mba"
  | "college_engineering"
  | "custom";

export interface InstitutionTemplate {
  label: string;
  grades: OrgGradeEntry[];
}

export const DEFAULT_SECTION_LABELS = ["A", "B", "C", "D"];

export const DEFAULT_GRADE_LABELS = [
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
];

const templateGrades = (labels: string[], withSections: boolean): OrgGradeEntry[] =>
  labels.map((label) => ({
    label,
    sections: withSections ? [...DEFAULT_SECTION_LABELS] : []
  }));

export const INSTITUTION_TEMPLATES: Record<InstitutionTemplateKey, InstitutionTemplate> = {
  school_primary: {
    label: "Primary School (Nursery–8th)",
    grades: templateGrades(
      ["Nursery", "KG", "KG2", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"],
      true
    )
  },
  school_secondary: {
    label: "Secondary School (1st–12th)",
    grades: templateGrades(
      ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"],
      true
    )
  },
  school_full: {
    label: "Full School (Nursery–12th)",
    grades: templateGrades(
      [
        "Nursery",
        "KG",
        "KG2",
        "1st",
        "2nd",
        "3rd",
        "4th",
        "5th",
        "6th",
        "7th",
        "8th",
        "9th",
        "10th",
        "11th",
        "12th"
      ],
      true
    )
  },
  college_bcom: {
    label: "B.Com College",
    grades: templateGrades(["FY B.Com", "SY B.Com", "TY B.Com"], false)
  },
  college_mba: {
    label: "MBA College",
    grades: templateGrades(
      [
        "MBA Year 1 (Sem 1)",
        "MBA Year 1 (Sem 2)",
        "MBA Year 2 (Sem 3)",
        "MBA Year 2 (Sem 4)"
      ],
      false
    )
  },
  college_engineering: {
    label: "Engineering College",
    grades: templateGrades(["FE", "SE", "TE", "BE"], true)
  },
  custom: {
    label: "Custom (define your own)",
    grades: []
  }
};
