import { describe, expect, it } from "vitest";

import { isClientSecretUsageLimitReached } from "./identity-ua-fns";

describe("isClientSecretUsageLimitReached", () => {
  it("does not trip early when pg returns int8 columns as strings", () => {
    expect(isClientSecretUsageLimitReached("2", "1000000")).toBe(false);
    expect(isClientSecretUsageLimitReached("6", "5000")).toBe(false);
  });

  it("trips once uses reach the limit", () => {
    expect(isClientSecretUsageLimitReached("1000000", "1000000")).toBe(true);
    expect(isClientSecretUsageLimitReached("5", "5")).toBe(true);
    expect(isClientSecretUsageLimitReached(5, 5)).toBe(true);
  });

  it("treats a limit of 0 as unlimited", () => {
    expect(isClientSecretUsageLimitReached("999999", "0")).toBe(false);
  });
});
