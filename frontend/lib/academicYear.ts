/** Month (0-based) in which a new academic year starts. 3 = April (Indian schools). */
const ACADEMIC_YEAR_START_MONTH = 3;

export const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Returns the academic year ("YYYY-YY") that contains the given date.
 * April 2026 – March 2027 → "2026-27".
 */
export const getCurrentAcademicYear = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= ACADEMIC_YEAR_START_MONTH ? year : year - 1;
  return formatAcademicYear(startYear);
};

const formatAcademicYear = (startYear: number): string =>
  `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

/** Moves an academic year forward/back: shiftAcademicYear("2026-27", 1) → "2027-28". */
export const shiftAcademicYear = (academicYear: string, delta: number): string => {
  const startYear = Number(academicYear.slice(0, 4));
  if (!ACADEMIC_YEAR_PATTERN.test(academicYear) || Number.isNaN(startYear)) {
    return academicYear;
  }
  return formatAcademicYear(startYear + delta);
};

/** Previous, current and next year — for academic year dropdowns. */
export const academicYearOptions = (current: string): string[] => [
  shiftAcademicYear(current, -1),
  current,
  shiftAcademicYear(current, 1)
];
