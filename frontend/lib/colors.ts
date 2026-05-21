export const colors = {
  primary: "#fd6d00",
  primaryHover: "#e56200",
  secondary: "#fe9b30",
  tertiary: "#febb71",
  light: "#fee3c7",
  lightest: "#fff7f0",

  white: "#ffffff",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray700: "#374151",
  gray900: "#111827",

  success: "#16a34a",
  successBg: "#dcfce7",
  warning: "#d97706",
  warningBg: "#fef3c7",
  danger: "#dc2626",
  dangerBg: "#fee2e2",
  info: "#2563eb",
  infoBg: "#dbeafe"
} as const;

/** Recharts palette */
export const chartColors = {
  primary: colors.primary,
  secondary: colors.secondary,
  tertiary: colors.tertiary,
  light: colors.light,
  pie: [colors.primary, colors.secondary, colors.tertiary, colors.light],
  grid: colors.gray100,
  axis: colors.gray400,
  tooltip: {
    bg: colors.white,
    border: colors.gray200
  }
} as const;
