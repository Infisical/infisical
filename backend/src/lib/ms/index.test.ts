import { formatDurationSeconds } from "./index";

describe("formatDurationSeconds", () => {
  test("uses the largest unit that divides the value exactly", () => {
    expect(formatDurationSeconds(5400)).toBe("90 minutes");
    expect(formatDurationSeconds(3600)).toBe("1 hour");
    expect(formatDurationSeconds(129_600)).toBe("36 hours");
    expect(formatDurationSeconds(604_800)).toBe("7 days");
    expect(formatDurationSeconds(5000)).toBe("5000 seconds");
  });
});
