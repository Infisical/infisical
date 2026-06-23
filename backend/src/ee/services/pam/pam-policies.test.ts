import { describe, expect, test } from "vitest";

import { PamAccountType } from "./pam-enums";
import { getApplicablePolicies, PamPolicyType, validatePolicyValues } from "./pam-policies";

describe("getApplicablePolicies", () => {
  test("returns the universal policies for any account type", () => {
    const keys = getApplicablePolicies(PamAccountType.Postgres).map((p) => p.key);
    expect(keys).toContain(PamPolicyType.RequireMfa);
    expect(keys).toContain(PamPolicyType.RequireReason);
    expect(keys).toContain(PamPolicyType.MaxSessionDuration);
  });
});

describe("validatePolicyValues", () => {
  test("returns empty data for null/undefined", () => {
    expect(validatePolicyValues(PamAccountType.SSH, null)).toEqual({ ok: true, data: {} });
    expect(validatePolicyValues(PamAccountType.SSH, undefined)).toEqual({ ok: true, data: {} });
  });

  test("accepts valid policy values", () => {
    expect(
      validatePolicyValues(PamAccountType.SSH, {
        [PamPolicyType.RequireMfa]: true,
        [PamPolicyType.MaxSessionDuration]: 3600
      })
    ).toEqual({
      ok: true,
      data: { [PamPolicyType.RequireMfa]: true, [PamPolicyType.MaxSessionDuration]: 3600 }
    });
  });

  test("rejects an unknown policy", () => {
    expect(validatePolicyValues(PamAccountType.SSH, { "not-a-policy": true }).ok).toBe(false);
  });

  test("rejects an invalid value shape", () => {
    expect(validatePolicyValues(PamAccountType.SSH, { [PamPolicyType.RequireMfa]: "nope" }).ok).toBe(false);
    expect(validatePolicyValues(PamAccountType.SSH, { [PamPolicyType.MaxSessionDuration]: 10 }).ok).toBe(false);
  });
});
