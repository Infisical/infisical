import { format } from "date-fns";

export enum Timezone {
  Local = "local",
  UTC = "UTC"
}

export const formatDateTime = ({
  timezone,
  timestamp,
  dateFormat = "MMM do yyyy, hh:mm a"
}: {
  timestamp: string | Date;
  timezone?: Timezone;
  dateFormat?: string;
}) => {
  const date = new Date(timestamp);

  if (timezone === Timezone.UTC) {
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return `${format(utcDate, dateFormat)}`;
  }
  return format(date, dateFormat);
};

// Helper function to convert duration to seconds
export const durationToSeconds = (
  value: number,
  unit: "s" | "m" | "h" | "d" | "w" | "y"
): number => {
  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 60 * 60;
    case "d":
      return value * 60 * 60 * 24;
    case "w":
      return value * 60 * 60 * 24 * 7;
    case "y":
      return value * 60 * 60 * 24 * 365;
    default:
      return 0;
  }
};

// Helper function to convert seconds to value and unit
export const getObjectFromSeconds = (
  totalSeconds: number,
  activeUnits?: Array<"s" | "m" | "h" | "d" | "w" | "y">
): { value: number; unit: "s" | "m" | "h" | "d" | "w" | "y" } => {
  const SECONDS_IN_MINUTE = 60;
  const SECONDS_IN_HOUR = SECONDS_IN_MINUTE * 60;
  const SECONDS_IN_DAY = SECONDS_IN_HOUR * 24;
  const SECONDS_IN_WEEK = SECONDS_IN_DAY * 7;
  const SECONDS_IN_YEAR = SECONDS_IN_DAY * 365;

  const activeUnitsSet = activeUnits ? new Set(activeUnits) : null;

  const isUnitActive = (unit: "s" | "m" | "h" | "d" | "w" | "y"): boolean => {
    return activeUnitsSet ? activeUnitsSet.has(unit) : true;
  };

  if (
    isUnitActive("y") &&
    totalSeconds >= SECONDS_IN_YEAR &&
    totalSeconds % SECONDS_IN_YEAR === 0
  ) {
    return { value: totalSeconds / SECONDS_IN_YEAR, unit: "y" };
  }

  if (
    isUnitActive("w") &&
    totalSeconds >= SECONDS_IN_WEEK &&
    totalSeconds % SECONDS_IN_WEEK === 0
  ) {
    return { value: totalSeconds / SECONDS_IN_WEEK, unit: "w" };
  }

  if (isUnitActive("d") && totalSeconds >= SECONDS_IN_DAY && totalSeconds % SECONDS_IN_DAY === 0) {
    return { value: totalSeconds / SECONDS_IN_DAY, unit: "d" };
  }

  if (
    isUnitActive("h") &&
    totalSeconds >= SECONDS_IN_HOUR &&
    totalSeconds % SECONDS_IN_HOUR === 0
  ) {
    return { value: totalSeconds / SECONDS_IN_HOUR, unit: "h" };
  }

  if (
    isUnitActive("m") &&
    totalSeconds >= SECONDS_IN_MINUTE &&
    totalSeconds % SECONDS_IN_MINUTE === 0
  ) {
    return { value: totalSeconds / SECONDS_IN_MINUTE, unit: "m" };
  }

  if (isUnitActive("s") && totalSeconds >= 1) {
    return { value: totalSeconds, unit: "s" };
  }

  return {
    value: 0,
    unit: "s"
  };
};
