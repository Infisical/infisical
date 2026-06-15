import { describe, expect, test } from "vitest";

import { toSafeUsername } from "./dynamic-secret-lease-service";

describe("toSafeUsername", () => {
  test("leaves a plain identifier unchanged", () => {
    expect(toSafeUsername("build_agent01")).toBe("build_agent01");
  });

  test("replaces disallowed characters with underscore", () => {
    expect(toSafeUsername("name with spaces")).toBe("name_with_spaces");
    expect(toSafeUsername("a.b@c")).toBe("a_b_c");
  });

  test("keeps letters, digits, underscore and hyphen", () => {
    expect(toSafeUsername("ci-runner_01")).toBe("ci-runner_01");
  });

  test("caps the result at 63 characters", () => {
    expect(toSafeUsername("a".repeat(100))).toHaveLength(63);
  });

  test("falls back to a default when nothing remains", () => {
    expect(toSafeUsername("")).toBe("inf_user");
  });
});
