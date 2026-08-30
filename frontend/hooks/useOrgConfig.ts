"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { OrgGradeConfig, OrgGradeEntry } from "@/types/orgConfig";

const STALE_TIME_MS = 5 * 60 * 1000;

export const ORG_CONFIG_QUERY_KEY = ["org-config"] as const;

export const useOrgConfig = (): {
  config: OrgGradeConfig | undefined;
  gradeOptions: string[];
  gradeFilterOptions: string[];
  getSectionsForGrade: (gradeLabel: string) => string[];
  hasAnySections: boolean;
  isLoading: boolean;
} => {
  const query = useQuery({
    queryKey: ORG_CONFIG_QUERY_KEY,
    queryFn: async () =>
      (await api.get<{ data: OrgGradeConfig }>("/api/organizations/config")).data.data,
    staleTime: STALE_TIME_MS
  });

  const grades = query.data?.grades ?? [];
  const gradeOptions = grades.map((grade) => grade.label);

  const getSectionsForGrade = (gradeLabel: string): string[] =>
    grades.find((grade) => grade.label === gradeLabel)?.sections ?? [];

  return {
    config: query.data,
    gradeOptions,
    gradeFilterOptions: ["All", ...gradeOptions],
    getSectionsForGrade,
    hasAnySections: grades.some((grade) => grade.sections.length > 0),
    isLoading: query.isLoading
  };
};

export const formatGradeDisplay = (grade: string, section?: string | null): string => {
  if (section) {
    return `${grade} - ${section}`;
  }
  return grade;
};

export const cloneGrades = (grades: OrgGradeEntry[]): OrgGradeEntry[] =>
  grades.map((grade) => ({ label: grade.label, sections: [...grade.sections] }));
