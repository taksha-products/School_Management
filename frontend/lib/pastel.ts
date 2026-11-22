/** Soft pastel card palette — matches School_Management_Parent_App/lib/pastel.ts. */
export interface Pastel {
  bg: string;
  accent: string;
  soft: string;
}

export const PASTELS: Pastel[] = [
  { bg: "#DCE8EE", accent: "#2F5F7A", soft: "#C3D8E3" },
  { bg: "#F0E3D9", accent: "#A8562F", soft: "#E6CDBB" },
  { bg: "#E0DBF1", accent: "#4E3F99", soft: "#CBC2E8" },
  { bg: "#DBEDDF", accent: "#2E7349", soft: "#C1E0C8" }
];

export const pastelAt = (index: number): Pastel => PASTELS[index % PASTELS.length];

export const INK = "#141414";
export const INK_MUTED = "#8A8F98";
export const TILE = "#F4F5F6";
export const SOFT_TEXT = "#A1A1AA";
export const SUCCESS_GREEN = "#4CB963";
