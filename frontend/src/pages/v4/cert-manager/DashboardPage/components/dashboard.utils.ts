export type InventoryFilters = {
  filterStatus?: string;
  filterEnrollmentType?: string;
  filterKeyAlgorithm?: string;
  filterCaId?: string;
  filterExpiresDays?: string;
  filterExpiresAfterDays?: string;
  viewId?: string;
};

export const ranges = [
  { label: "7D", value: "7d", days: 7 },
  { label: "30D", value: "30d", days: 30 },
  { label: "6M", value: "6m", days: 180 }
];

export const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)"
];

export const otherColor = "var(--cipher-faint)";

export const MAX_DONUT_SEGMENTS = 6;

export const formatShare = (count: number, total: number) => {
  if (total <= 0) return "0%";
  const share = (count / total) * 100;
  if (share > 0 && share < 1) return "<1%";
  if (share > 99 && share < 100) return ">99%";
  return `${Math.round(share)}%`;
};

export const formatTickLabel = (value: string) => {
  if (value.length === 10) {
    const [year, month, date] = value.split("-").map(Number);
    return new Date(year, month - 1, date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
  }
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit"
  });
};
