import { describe, expect, test } from "vitest";

import { nameList } from "./nameList";

describe("nameList", () => {
  test.each([
    [["a"], undefined, "a"],
    [["a", "b"], undefined, "a and b"],
    [["a", "b", "c"], undefined, "a, b and c"],
    [["a", "b", "c", "d"], undefined, "a, b, c and 1 more"],
    [["a", "b", "c"], 17, "a, b, c and 14 more"]
  ])("%j of %s", (names, total, expected) => {
    expect(nameList(names, total)).toBe(expected);
  });
});
