import { describe, expect, test } from "vitest";

import {
  formatAccessDurationLimit,
  getAccessDurationOptions,
  isAccessDurationCapped
} from "./accessDuration";
import { formatDuration } from "./formatDuration";

const values = (maxSeconds?: number | null) =>
  getAccessDurationOptions(maxSeconds).map((option) => option.value);

describe("getAccessDurationOptions", () => {
  test("offers every preset without a max", () => {
    expect(values(null)).toEqual(["15m", "1h", "4h", "1d", "3d", "7d"]);
  });

  test("keeps presets at the max and does not repeat it", () => {
    expect(values(86_400)).toEqual(["15m", "1h", "4h", "1d"]);
  });

  test("adds the max when it is not a preset", () => {
    expect(values(5400)).toEqual(["15m", "1h", "90m"]);
    expect(values(300)).toEqual(["5m"]);
  });
});

describe("isAccessDurationCapped", () => {
  test("is true only when the request is longer than the max", () => {
    expect(isAccessDurationCapped("2h", 3600)).toBe(true);
    expect(isAccessDurationCapped("1h", 3600)).toBe(false);
    expect(isAccessDurationCapped("7d", null)).toBe(false);
  });
});

describe("duration labels", () => {
  test("never round", () => {
    expect(formatAccessDurationLimit(5400)).toBe("90 minutes");
    expect(formatDuration("90m")).toBe("90 minutes");
    expect(formatDuration("36h")).toBe("36 hours");
    expect(formatDuration("3600000ms")).toBe("1 hour");
  });
});
