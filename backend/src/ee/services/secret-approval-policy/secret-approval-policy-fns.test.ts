import { describe, expect, test } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";

import { getPolicyScore, resolvePolicyForPath, shouldApplyPolicy } from "./secret-approval-policy-fns";

const makePolicy = (bypassForMachineIdentities = false) => ({ bypassForMachineIdentities });

const makePathPolicy = (id: string, secretPath: string | null, createdAt = "2026-01-01") => ({
  id,
  secretPath,
  createdAt: new Date(createdAt)
});

describe("getPolicyScore", () => {
  test("ranks an exact path above a glob above an environment-wide policy", () => {
    expect(getPolicyScore({ secretPath: "/app/svc" })).toBe(2);
    expect(getPolicyScore({ secretPath: "/app/**" })).toBe(1);
    expect(getPolicyScore({ secretPath: null })).toBe(0);
    expect(getPolicyScore({})).toBe(0);
  });
});

describe("resolvePolicyForPath", () => {
  test("picks the exact path over a glob over an environment-wide policy", () => {
    const envWide = makePathPolicy("env", null);
    const glob = makePathPolicy("glob", "/app/**");
    const exact = makePathPolicy("exact", "/app/svc");

    expect(resolvePolicyForPath([envWide, glob, exact], "/app/svc")).toBe(exact);
    expect(resolvePolicyForPath([envWide, glob, exact], "/app/other")).toBe(glob);
    expect(resolvePolicyForPath([envWide, glob, exact], "/elsewhere")).toBe(envWide);
  });

  test("ignores policies whose path does not match", () => {
    expect(resolvePolicyForPath([makePathPolicy("a", "/app/**")], "/db")).toBeUndefined();
    expect(resolvePolicyForPath([], "/db")).toBeUndefined();
  });

  test("breaks a tie on the earliest creation regardless of input order", () => {
    const newer = makePathPolicy("newer", "/app/**", "2026-02-01");
    const older = makePathPolicy("older", "/app/*", "2026-01-01");

    expect(resolvePolicyForPath([newer, older], "/app/svc")).toBe(older);
    expect(resolvePolicyForPath([older, newer], "/app/svc")).toBe(older);
  });

  test("falls back to the id when creation times are equal", () => {
    const b = makePathPolicy("b", "/app/**");
    const a = makePathPolicy("a", "/app/*");

    expect(resolvePolicyForPath([b, a], "/app/svc")).toBe(a);
  });
});

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
