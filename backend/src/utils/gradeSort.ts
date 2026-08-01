const EARLY_GRADE_ORDER: Record<string, number> = {
  Nursery: 0,
  Prep: 1,
  KG: 2,
  KG1: 3,
  KG2: 4
};

const earlyGradeRank = (grade: string): number | null => {
  const trimmed = grade.trim();
  const direct = EARLY_GRADE_ORDER[trimmed];
  if (direct !== undefined) {
    return direct;
  }

  const lower = trimmed.toLowerCase();
  for (const [label, rank] of Object.entries(EARLY_GRADE_ORDER)) {
    if (label.toLowerCase() === lower) {
      return rank;
    }
  }

  return null;
};

const numericGradeRank = (grade: string): number | null => {
  const trimmed = grade.trim();
  if (/^\d+$/.test(trimmed)) {
    return 100 + Number(trimmed);
  }
  return null;
};

const gradeSortTuple = (grade: string): [number, string] => {
  const trimmed = grade.trim();
  const early = earlyGradeRank(trimmed);
  if (early !== null) {
    return [early, trimmed];
  }

  const numeric = numericGradeRank(trimmed);
  if (numeric !== null) {
    return [numeric, trimmed];
  }

  return [1000, trimmed];
};

export const sortGrades = (grades: string[]): string[] =>
  [...grades].sort((a, b) => {
    const [rankA, labelA] = gradeSortTuple(a);
    const [rankB, labelB] = gradeSortTuple(b);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return labelA.localeCompare(labelB, undefined, { numeric: true, sensitivity: "base" });
  });
