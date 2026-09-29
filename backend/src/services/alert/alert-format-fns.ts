import RE2 from "re2";

import { TAlertSeverity } from "./alert-channel-types";

const durationRegex = new RE2("^(\\d+)([dwmy])$");
const DAYS_PER_DURATION_UNIT: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };

export const daysUntil = (date: Date): number =>
  Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

export const durationToDays = (duration: string): number => {
  const match = durationRegex.exec(duration);
  return match ? parseInt(match[1], 10) * DAYS_PER_DURATION_UNIT[match[2]] : Number.NaN;
};

export const humanizeDays = (days: number): string => `${days} day${days === 1 ? "" : "s"}`;

export const formatUtcDate = (date: Date): string =>
  new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  });

export const expirySeverity = (expiryDates: Date[]): TAlertSeverity => {
  const minDays = Math.min(...expiryDates.map(daysUntil));
  if (minDays <= 7) return "critical";
  if (minDays <= 14) return "error";
  if (minDays <= 30) return "warning";
  return "info";
};
