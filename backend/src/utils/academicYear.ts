/** Month (0-based) in which a new academic year starts. 3 = April (Indian schools). */
const ACADEMIC_YEAR_START_MONTH = 3;

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Returns the academic year ("YYYY-YY") that contains the given date.
 * April 2026 – March 2027 → "2026-27".
 */
export const getCurrentAcademicYear = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= ACADEMIC_YEAR_START_MONTH ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
};

/** The org's configured academic year, or the one for today when unset/invalid. */
export const resolveAcademicYear = (configured?: string | null): string =>
  configured && ACADEMIC_YEAR_PATTERN.test(configured) ? configured : getCurrentAcademicYear();
