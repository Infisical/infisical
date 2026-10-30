// Categorical palette built from theme tokens only (DESIGN.md forbids new hex values).
// TODO: hoist a shared chart palette — this list is duplicated in
// pages/cert-manager/DashboardPage/components/chart-theme.tsx, and
// pages/secret-manager/InsightsPage/components/AuthMethodChart.tsx keeps a hex variant.
export const CHART_COLORS = [
  "var(--color-info)",
  "var(--color-warning)",
  "var(--color-neutral)",
  "var(--color-accent)",
  "var(--color-success)",
  "var(--color-org)",
  "var(--color-danger)"
];
