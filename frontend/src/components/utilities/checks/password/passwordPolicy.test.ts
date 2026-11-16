import { describe, expect, test } from "vitest";

import { TPasswordPolicy } from "@app/hooks/api/admin/types";

import { doesPasswordMeetPolicy } from "./passwordPolicy";

const policy: TPasswordPolicy = {
  requirements: [
    {
      code: "min-length",
      message: "At least 14 characters",
      validationMessage: "Password must be at least 14 characters",
      isPrimary: true,
      patterns: ["^.{14,}$"],
      shouldMatch: true
    },
    {
      code: "no-repeats",
      message: "No more than 3 repeated characters in a row",
      validationMessage: "Password must not repeat a character more than 3 times in a row",
      isPrimary: false,
      patterns: [],
      maxConsecutiveCharacters: 3,
      shouldMatch: false
    }
  ]
};

describe("doesPasswordMeetPolicy", () => {
  test("is true when every requirement is met", () => {
    expect(doesPasswordMeetPolicy("Correct-Horse-Battery-7!", policy)).toBe(true);
  });

  test("is false when any requirement is not met", () => {
    expect(doesPasswordMeetPolicy("short", policy)).toBe(false);
    expect(doesPasswordMeetPolicy("Correct-Horse-Battery-7777!", policy)).toBe(false);
  });
});
