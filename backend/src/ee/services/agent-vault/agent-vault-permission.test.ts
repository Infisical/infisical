import { describe, expect, test } from "vitest";

import { intersectAccessBundleIds } from "./agent-vault-permission";

describe("intersectAccessBundleIds", () => {
  // null is every bundle, the admin role's reach.
  test.each([
    { a: null, b: null, expected: null },
    { a: null, b: [], expected: [] },
    { a: [], b: null, expected: [] },
    { a: null, b: ["x"], expected: ["x"] },
    { a: ["x"], b: null, expected: ["x"] },
    { a: ["x", "y"], b: ["y", "z"], expected: ["y"] },
    { a: ["x"], b: ["z"], expected: [] }
  ])("$a and $b reach $expected", ({ a, b, expected }) => {
    expect(intersectAccessBundleIds(a, b)).toEqual(expected);
  });
});
