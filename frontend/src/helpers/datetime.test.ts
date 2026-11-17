import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDateTime, Timezone } from "./datetime";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("formatDateTime", () => {
  it.each([
    ["2026-03-08T02:30:00Z", "2026-03-08 02:30"],
    ["2026-03-08T05:30:00Z", "2026-03-08 05:30"],
    ["2026-11-01T04:30:00Z", "2026-11-01 04:30"]
  ])("formats %s in UTC across daylight-saving transitions", (timestamp, expected) => {
    vi.stubEnv("TZ", "America/New_York");

    expect(
      formatDateTime({ timestamp, timezone: Timezone.UTC, dateFormat: "yyyy-MM-dd HH:mm" })
    ).toBe(expected);
  });

  it("uses UTC for timezone tokens", () => {
    vi.stubEnv("TZ", "Asia/Kolkata");

    expect(
      formatDateTime({
        timestamp: "2026-03-08T05:30:00Z",
        timezone: Timezone.UTC,
        dateFormat: "yyyy-MM-dd HH:mm XXX"
      })
    ).toBe("2026-03-08 05:30 Z");
  });

  it("keeps the default date format in UTC", () => {
    vi.stubEnv("TZ", "America/New_York");

    expect(formatDateTime({ timestamp: "2026-03-08T05:30:00Z", timezone: Timezone.UTC })).toBe(
      "Mar 8th 2026, 05:30 AM"
    );
  });

  it.each([Timezone.Local, undefined])("keeps local formatting for timezone %s", (timezone) => {
    vi.stubEnv("TZ", "America/New_York");

    expect(
      formatDateTime({
        timestamp: "2026-03-08T07:30:00Z",
        timezone,
        dateFormat: "yyyy-MM-dd HH:mm"
      })
    ).toBe("2026-03-08 03:30");
  });

  it("does not mutate a Date input", () => {
    vi.stubEnv("TZ", "America/New_York");
    const timestamp = new Date("2026-11-01T04:30:00Z");

    expect(formatDateTime({ timestamp, timezone: Timezone.UTC, dateFormat: "yyyy-MM-dd" })).toBe(
      "2026-11-01"
    );
    expect(timestamp.toISOString()).toBe("2026-11-01T04:30:00.000Z");
  });
});
