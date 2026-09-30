import { describe, expect, it } from "vitest";

import { hasEnvironmentCapacity } from "./environment-limit";

describe("hasEnvironmentCapacity", () => {
  it.each([
    [3, 2, true],
    [3, 3, false],
    [3, 4, false],
    [6, 3, true],
    [6, 6, false],
    [12, 6, true],
    [null, 12, true],
    [undefined, 12, true],
    [0, 12, true]
  ] as const)("preserves the existing limit check for limit %s and count %s", (limit, count, allowed) => {
    expect(hasEnvironmentCapacity(limit, count)).toBe(allowed);
  });
});
