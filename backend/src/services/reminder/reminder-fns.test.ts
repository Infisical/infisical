import { advanceReminderDate, getReminderDueWindow, toUtcDateString } from "./reminder-fns";

const at = (iso: string) => new Date(iso);

describe("getReminderDueWindow", () => {
  test("spans the last seven UTC days through the end of today", () => {
    const { from, to } = getReminderDueWindow(at("2026-10-10T00:00:05.000Z"));
    expect(from.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-10T23:59:59.999Z");
  });
});

describe("advanceReminderDate", () => {
  test("moves a reminder due today one interval forward", () => {
    const next = advanceReminderDate(at("2026-10-10T00:00:00.000Z"), 30, at("2026-10-10T00:00:05.000Z"));
    expect(next.toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  test("keeps the schedule anchored when the run happens late in the day", () => {
    const next = advanceReminderDate(at("2026-10-10T00:00:00.000Z"), 1, at("2026-10-10T23:30:00.000Z"));
    expect(next.toISOString()).toBe("2026-10-11T00:00:00.000Z");
  });

  test("skips past every missed occurrence of a caught-up reminder", () => {
    // Due on the 5th, every 2 days, caught up on the 10th: the 7th and 9th are skipped, not queued.
    const next = advanceReminderDate(at("2026-10-05T00:00:00.000Z"), 2, at("2026-10-10T00:00:05.000Z"));
    expect(next.toISOString()).toBe("2026-10-11T00:00:00.000Z");
  });

  test("always lands after today, even when an occurrence falls exactly on today", () => {
    const next = advanceReminderDate(at("2026-10-06T00:00:00.000Z"), 2, at("2026-10-10T00:00:05.000Z"));
    expect(next.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });
});

describe("toUtcDateString", () => {
  test("uses the UTC calendar day", () => {
    expect(toUtcDateString(at("2026-10-10T23:59:59.000Z"))).toBe("2026-10-10");
  });
});
