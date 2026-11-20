"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useOrgConfig } from "@/hooks/useOrgConfig";
import { ACADEMIC_YEAR_PATTERN, getCurrentAcademicYear } from "@/lib/academicYear";

/**
 * The organization's current academic year (Settings → Organization).
 * Falls back to the year for today's date until the org config loads.
 */
export const useAcademicYear = (): string => {
  const { config } = useOrgConfig();
  const configured = config?.currentAcademicYear;
  return configured && ACADEMIC_YEAR_PATTERN.test(configured)
    ? configured
    : getCurrentAcademicYear();
};

/**
 * Editable academic year (filters, forms) that starts at the org's year and
 * follows it when the org config loads — until the user picks a value.
 */
export const useAcademicYearState = (): [string, (value: string) => void] => {
  const orgYear = useAcademicYear();
  const [year, setYear] = useState(orgYear);
  const userChanged = useRef(false);

  useEffect(() => {
    if (!userChanged.current) setYear(orgYear);
  }, [orgYear]);

  const setUserYear = useCallback((value: string) => {
    userChanged.current = true;
    setYear(value);
  }, []);

  return [year, setUserYear];
};
