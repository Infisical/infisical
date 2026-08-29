import { describe, expect, test } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";

import { shouldApplyPolicy } from "./secret-approval-policy-fns";

const makePolicy = (bypassForMachineIdentities = false) => ({ bypassForMachineIdentities });

describe("shouldApplyPolicy", () => {
  test("returns false when policy is undefined", () => {
    expect(shouldApplyPolicy(undefined, ActorType.USER)).toBe(false);
  });

  test("returns true for USER actor with bypass disabled", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.USER)).toBe(true);
  });

  test("returns true for USER actor with bypass enabled (bypass only affects identities)", () => {
    expect(shouldApplyPolicy(makePolicy(true), ActorType.USER)).toBe(true);
  });

  test("returns true for IDENTITY actor with bypass disabled", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.IDENTITY)).toBe(true);
  });

  test("returns false for IDENTITY actor with bypass enabled", () => {
    expect(shouldApplyPolicy(makePolicy(true), ActorType.IDENTITY)).toBe(false);
  });

  test("returns false for SERVICE actor", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.SERVICE)).toBe(false);
  });

  test("returns false for PLATFORM actor", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.PLATFORM)).toBe(false);
  });

  test("returns false for SCIM_CLIENT actor", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.SCIM_CLIENT)).toBe(false);
  });

  test("returns false for GATEWAY actor", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.GATEWAY)).toBe(false);
  });
});
