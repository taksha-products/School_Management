export const GRADE_OPTIONS = ["All", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export const FEE_HEAD_PRESETS = [
  { name: "Tuition Fee", category: "academic" as const, frequency: "monthly" as const },
  { name: "Library Fee", category: "facility" as const, frequency: "annual" as const },
  { name: "Sports Fee", category: "other" as const, frequency: "annual" as const },
  { name: "Lab Fee", category: "facility" as const, frequency: "quarterly" as const },
  { name: "Exam Fee", category: "exam" as const, frequency: "oneTime" as const }
];
