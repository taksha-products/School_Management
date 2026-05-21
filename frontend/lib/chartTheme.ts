import { colors } from "./colors";

export const CHART_PRIMARY = colors.primary;
export const CHART_SECONDARY = colors.secondary;
export const CHART_TERTIARY = colors.tertiary;
export const CHART_LIGHT = colors.light;
export const CHART_PIE_COLORS = [colors.primary, colors.secondary, colors.tertiary, colors.light];

export const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: colors.white,
    border: `1px solid ${colors.gray200}`,
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.1)",
    fontSize: "13px"
  },
  labelStyle: { color: colors.gray500 },
  itemStyle: { color: colors.gray900 }
};

export const chartGridProps = {
  stroke: colors.gray100,
  strokeDasharray: "3 3"
};

export const chartAxisTick = {
  fill: colors.gray400,
  fontSize: 12
};
