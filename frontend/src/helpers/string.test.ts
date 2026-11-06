import { describe, expect, test } from "vitest";

import { getInitials, nameList } from "./string";

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

describe("getInitials", () => {
  test.each([
    ["Jane Doe", "JD"],
    ["Mary Jane Watson", "MJ"],
    ["jane.doe@example.com", "JD"],
    ["user05@example.com", "U"],
    ["support-triage", "ST"],
    ["", "?"]
  ])("%j", (value, expected) => {
    expect(getInitials(value)).toBe(expected);
  });
});
