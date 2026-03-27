import { useCallback, useState } from "react";

import { ClockFormat, Timezone } from "@app/helpers/datetime";

const STORAGE_KEY = "infisical-audit-logs-datetime-v1";

type StoredPrefs = {
  timezone?: string;
  clockFormat?: string;
};

const DEFAULT_TIMEZONE = Timezone.Local;
const DEFAULT_CLOCK_FORMAT = ClockFormat.TwelveHour;

const isTimezone = (v: unknown): v is Timezone =>
  typeof v === "string" && (Object.values(Timezone) as string[]).includes(v);

const isClockFormat = (v: unknown): v is ClockFormat =>
  typeof v === "string" && (Object.values(ClockFormat) as string[]).includes(v);

const readStored = (): { timezone: Timezone; clockFormat: ClockFormat } => {
  if (typeof window === "undefined") {
    return { timezone: DEFAULT_TIMEZONE, clockFormat: DEFAULT_CLOCK_FORMAT };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { timezone: DEFAULT_TIMEZONE, clockFormat: DEFAULT_CLOCK_FORMAT };
    }
    const parsed = JSON.parse(raw) as StoredPrefs;
    return {
      timezone: isTimezone(parsed.timezone) ? parsed.timezone : DEFAULT_TIMEZONE,
      clockFormat: isClockFormat(parsed.clockFormat) ? parsed.clockFormat : DEFAULT_CLOCK_FORMAT
    };
  } catch {
    return { timezone: DEFAULT_TIMEZONE, clockFormat: DEFAULT_CLOCK_FORMAT };
  }
};

type AuditLogsDateTimePrefs = ReturnType<typeof readStored>;

const writeStored = (prefs: AuditLogsDateTimePrefs) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ timezone: prefs.timezone, clockFormat: prefs.clockFormat })
  );
};

export const useAuditLogsDateTimePreferences = () => {
  const [prefs, setPrefs] = useState<AuditLogsDateTimePrefs>(() => readStored());

  const setTimezone = useCallback((timezone: Timezone) => {
    setPrefs((prev: AuditLogsDateTimePrefs) => {
      const next = { ...prev, timezone };
      writeStored(next);
      return next;
    });
  }, []);

  const setClockFormat = useCallback((clockFormat: ClockFormat) => {
    setPrefs((prev: AuditLogsDateTimePrefs) => {
      const next = { ...prev, clockFormat };
      writeStored(next);
      return next;
    });
  }, []);

  return {
    timezone: prefs.timezone,
    clockFormat: prefs.clockFormat,
    setTimezone,
    setClockFormat
  };
};
