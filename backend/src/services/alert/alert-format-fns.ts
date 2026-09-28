import { TAlertSeverity } from "./alert-channel-types";

export const daysUntil = (date: Date): number =>
  Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

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
