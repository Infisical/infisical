export const CHART_COLORS = [
  "var(--color-info)",
  "var(--color-warning)",
  "var(--color-neutral)",
  "var(--color-accent)",
  "var(--color-muted)",
  "var(--color-success)",
  "var(--color-org)",
  "var(--color-danger)"
];

export const CHART_COLORS_HEX = [
  "#63b0bd",
  "#f1c40f",
  "#adaeb0",
  "#7d7f80",
  "#707174",
  "#2ecc71",
  "#30b3ff",
  "#e74c3c"
];

export const TREND_COLORS = {
  issued: "var(--color-org)",
  expired: "var(--color-danger)",
  revoked: "var(--color-neutral)",
  renewed: "var(--color-success)"
};

export const formatTickLabel = (value: string) => {
  if (value.length === 10) {
    const [, m, d] = value.split("-");
    const date = new Date(Number(value.slice(0, 4)), Number(m) - 1, Number(d));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};

export const legendFormatter = (value: string) => (
  <span className="text-xs text-muted capitalize">{value}</span>
);

export const nonZeroDot = (dataKey: string, color: string, seriesKeys?: string[]) => {
  return ({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Record<string, number> }) => {
    if (cx == null || cy == null) return null;
    const val = payload?.[dataKey];
    if (!val || val === 0) return null;

    let offsetX = 0;
    if (seriesKeys) {
      const sameValKeys = seriesKeys.filter((k) => payload?.[k] === val);
      const myIdx = sameValKeys.indexOf(dataKey);
      offsetX = sameValKeys.length > 1 ? (myIdx - (sameValKeys.length - 1) / 2) * 6 : 0;
    }

    return (
      <circle
        cx={cx + offsetX}
        cy={cy}
        r={3}
        fill={color}
        stroke="var(--color-popover)"
        strokeWidth={1.5}
      />
    );
  };
};
