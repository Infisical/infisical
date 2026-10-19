import { describe, expect, test } from "vitest";

import { isUnboundAuthGrandfathered, UNBOUND_AUTH_CUTOFF } from "./identity-auth-trust-binding-fns";

describe("isUnboundAuthGrandfathered", () => {
  test("is true for an auth config saved before the cutoff", () => {
    expect(isUnboundAuthGrandfathered(new Date(UNBOUND_AUTH_CUTOFF.getTime() - 1))).toBe(true);
  });

  test("is false at the cutoff", () => {
    expect(isUnboundAuthGrandfathered(new Date(UNBOUND_AUTH_CUTOFF.getTime()))).toBe(false);
  });

  test("is false for an auth config saved after the cutoff", () => {
    expect(isUnboundAuthGrandfathered(new Date(UNBOUND_AUTH_CUTOFF.getTime() + 1))).toBe(false);
  });
});
