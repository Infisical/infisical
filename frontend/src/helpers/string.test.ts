import { describe, expect, test } from "vitest";

import { nameList } from "./string";

describe("nameList", () => {
  test.each([
    [["a"], "a"],
    [["a", "b"], "a and b"],
    [["a", "b", "c"], "a, b and c"],
    [["a", "b", "c", "d", "e"], "a, b, c and 2 more"]
  ])("%j", (names, expected) => {
    expect(nameList(names)).toBe(expected);
  });
});
