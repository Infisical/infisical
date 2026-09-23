import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getSecretScanningStuckScanTimeout, secretScanningTimeoutsSchema } from "./env";

const parse = (env: Record<string, string>) => secretScanningTimeoutsSchema.safeParse(env);

const issuesFor = (result: ReturnType<typeof parse>, key: string) =>
  result.success ? [] : result.error.issues.filter((issue) => issue.path[0] === key).map((issue) => issue.message);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("secret scanning timeouts", () => {
  test("defaults to ten minute clone and scan timeouts", () => {
    const result = parse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        SECRET_SCANNING_CLONE_TIMEOUT: 10 * 60 * 1000,
        SECRET_SCANNING_SCAN_TIMEOUT: 10 * 60 * 1000
      });
    }
  });

  test.each([
    ["30s", 30 * 1000],
    ["90s", 90 * 1000],
    ["15m", 15 * 60 * 1000],
    ["2h", 2 * 60 * 60 * 1000]
  ])("reads %s as milliseconds", (value, expected) => {
    const result = parse({ SECRET_SCANNING_SCAN_TIMEOUT: value });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.SECRET_SCANNING_SCAN_TIMEOUT).toBe(expected);
  });

  test("treats a blank value as unset", () => {
    const result = parse({ SECRET_SCANNING_SCAN_TIMEOUT: "   " });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.SECRET_SCANNING_SCAN_TIMEOUT).toBe(10 * 60 * 1000);
  });

  test("rejects a duration it cannot parse", () => {
    expect(issuesFor(parse({ SECRET_SCANNING_SCAN_TIMEOUT: "banana" }), "SECRET_SCANNING_SCAN_TIMEOUT")).toEqual([
      'Invalid duration "banana" in SECRET_SCANNING_SCAN_TIMEOUT. Expected a positive duration string such as "30s", "10m" or "6h".'
    ]);
  });

  test("rejects a duration that rounds below a millisecond", () => {
    expect(parse({ SECRET_SCANNING_SCAN_TIMEOUT: "0s" }).success).toBe(false);
  });

  describe("legacy `_MS` variables", () => {
    test("supplies the value when the duration variable is unset", () => {
      vi.stubEnv("SECRET_SCANNING_CLONE_TIMEOUT_MS", "60000");

      const result = parse({});

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.SECRET_SCANNING_CLONE_TIMEOUT).toBe(60 * 1000);
    });

    test("loses to the duration variable when both are set", () => {
      vi.stubEnv("SECRET_SCANNING_SCAN_TIMEOUT_MS", "60000");

      const result = parse({ SECRET_SCANNING_SCAN_TIMEOUT: "20s" });

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.SECRET_SCANNING_SCAN_TIMEOUT).toBe(20 * 1000);
    });

    test("falls through to the default when blank", () => {
      vi.stubEnv("SECRET_SCANNING_SCAN_TIMEOUT_MS", "   ");

      const result = parse({});

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.SECRET_SCANNING_SCAN_TIMEOUT).toBe(10 * 60 * 1000);
    });

    test("is rejected by its own name when it holds something other than a number", () => {
      vi.stubEnv("SECRET_SCANNING_SCAN_TIMEOUT_MS", "nope");

      expect(issuesFor(parse({}), "SECRET_SCANNING_SCAN_TIMEOUT")).toEqual([
        'Invalid value "nope" in SECRET_SCANNING_SCAN_TIMEOUT_MS. Expected a positive number of milliseconds.'
      ]);
    });
  });

  describe("stuck scan threshold", () => {
    test("leaves room for a clone, a scan, the commit enumeration and the fixed overhead", () => {
      const result = parse({ SECRET_SCANNING_CLONE_TIMEOUT: "10m", SECRET_SCANNING_SCAN_TIMEOUT: "20m" });

      expect(result.success).toBe(true);
      if (result.success) expect(getSecretScanningStuckScanTimeout(result.data)).toBe(40 * 60 * 1000);
    });

    test("tracks the defaults", () => {
      const result = parse({});

      expect(result.success).toBe(true);
      if (result.success) expect(getSecretScanningStuckScanTimeout(result.data)).toBe(30 * 60 * 1000);
    });

    test("tracks the legacy variables the same way", () => {
      vi.stubEnv("SECRET_SCANNING_SCAN_TIMEOUT_MS", "3600000");

      const result = parse({});

      expect(result.success).toBe(true);
      if (result.success) expect(getSecretScanningStuckScanTimeout(result.data)).toBe(80 * 60 * 1000);
    });
  });
});

describe("deprecation warning", () => {
  // unit tests never call initLogger, so the warning lands on console
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  // the spy is installed at collection time, so it carries calls from the tests above
  beforeEach(() => {
    warn.mockClear();
  });

  test("stays quiet when no legacy variable is set", () => {
    parse({});

    expect(warn).not.toHaveBeenCalled();
  });

  test("names the legacy variable and its replacement", () => {
    vi.stubEnv("SECRET_SCANNING_SCAN_TIMEOUT_MS", "600000");

    parse({});

    expect(warn).toHaveBeenCalledWith(
      "Warning: The environment variable SECRET_SCANNING_SCAN_TIMEOUT_MS has been deprecated. Please use SECRET_SCANNING_SCAN_TIMEOUT instead."
    );
  });

  test("warns for each legacy variable that is set", () => {
    vi.stubEnv("SECRET_SCANNING_SCAN_TIMEOUT_MS", "600000");
    vi.stubEnv("SECRET_SCANNING_CLONE_TIMEOUT_MS", "600000");

    parse({});

    expect(warn).toHaveBeenCalledTimes(2);
  });

  test("ignores a blank legacy variable", () => {
    vi.stubEnv("SECRET_SCANNING_CLONE_TIMEOUT_MS", "   ");

    parse({});

    expect(warn).not.toHaveBeenCalled();
  });

  test("warns even when the replacement is set, because the legacy value is then dead weight", () => {
    vi.stubEnv("SECRET_SCANNING_CLONE_TIMEOUT_MS", "600000");

    parse({ SECRET_SCANNING_CLONE_TIMEOUT: "2h" });

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
