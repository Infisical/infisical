import { describe, expect, test } from "vitest";

import { PamAccountType } from "./pam-enums";
import { getApplicablePolicies, PamPolicyType, resolveAccessControls, validatePolicyValues } from "./pam-policies";

describe("getApplicablePolicies", () => {
  test("returns the universal policies for any account type", () => {
    const keys = getApplicablePolicies(PamAccountType.Postgres).map((p) => p.key);
    expect(keys).toContain(PamPolicyType.RequireMfa);
    expect(keys).toContain(PamPolicyType.RequireReason);
    expect(keys).toContain(PamPolicyType.MaxSessionDuration);
  });

  test("returns command blocking only for SSH", () => {
    const sshKeys = getApplicablePolicies(PamAccountType.SSH).map((p) => p.key);
    expect(sshKeys).toContain(PamPolicyType.CommandBlocking);

    const pgKeys = getApplicablePolicies(PamAccountType.Postgres).map((p) => p.key);
    expect(pgKeys).not.toContain(PamPolicyType.CommandBlocking);

    const mysqlKeys = getApplicablePolicies(PamAccountType.MySQL).map((p) => p.key);
    expect(mysqlKeys).not.toContain(PamPolicyType.CommandBlocking);
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

  test("accepts valid command blocking patterns for SSH", () => {
    const result = validatePolicyValues(PamAccountType.SSH, {
      [PamPolicyType.CommandBlocking]: "rm -rf.*\nsudo su\nshutdown"
    });
    expect(result.ok).toBe(true);
  });

  test("rejects command blocking for non-SSH types", () => {
    const result = validatePolicyValues(PamAccountType.Postgres, {
      [PamPolicyType.CommandBlocking]: "rm -rf.*"
    });
    expect(result.ok).toBe(false);
  });

  test("rejects non-string command blocking values", () => {
    expect(validatePolicyValues(PamAccountType.SSH, { [PamPolicyType.CommandBlocking]: ["rm"] }).ok).toBe(false);
    expect(validatePolicyValues(PamAccountType.SSH, { [PamPolicyType.CommandBlocking]: true }).ok).toBe(false);
  });

  test("rejects command blocking with too many patterns", () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `pattern${i}`).join("\n");
    expect(validatePolicyValues(PamAccountType.SSH, { [PamPolicyType.CommandBlocking]: tooMany }).ok).toBe(false);
  });

  test("rejects command blocking with a pattern exceeding 500 chars", () => {
    const longPattern = "a".repeat(501);
    expect(validatePolicyValues(PamAccountType.SSH, { [PamPolicyType.CommandBlocking]: longPattern }).ok).toBe(false);
  });

  test("rejects invalid regex patterns", () => {
    expect(validatePolicyValues(PamAccountType.SSH, { [PamPolicyType.CommandBlocking]: "[unclosed" }).ok).toBe(false);
    expect(validatePolicyValues(PamAccountType.SSH, { [PamPolicyType.CommandBlocking]: "(unmatched" }).ok).toBe(false);
  });
});

describe("resolveAccessControls", () => {
  const DEFAULTS = {
    requiresApproval: false,
    requireReason: false,
    requireMfa: false,
    maxSessionDurationSeconds: null
  };

  test("falls back to defaults for a missing or non-object map", () => {
    expect(resolveAccessControls(null)).toEqual(DEFAULTS);
    expect(resolveAccessControls(undefined)).toEqual(DEFAULTS);
    expect(resolveAccessControls("not-an-object")).toEqual(DEFAULTS);
    expect(resolveAccessControls(42)).toEqual(DEFAULTS);
  });

  test("falls back to defaults for an empty map", () => {
    expect(resolveAccessControls({})).toEqual(DEFAULTS);
  });

  test("resolves a fully populated map", () => {
    expect(
      resolveAccessControls({
        [PamPolicyType.RequireReason]: true,
        [PamPolicyType.RequireMfa]: true,
        [PamPolicyType.MaxSessionDuration]: 3600
      })
    ).toEqual({ requiresApproval: false, requireReason: true, requireMfa: true, maxSessionDurationSeconds: 3600 });
  });

  test("resolves each policy independently of the others", () => {
    expect(resolveAccessControls({ [PamPolicyType.RequireMfa]: true })).toEqual({
      ...DEFAULTS,
      requireMfa: true
    });
    expect(resolveAccessControls({ [PamPolicyType.MaxSessionDuration]: 60 })).toEqual({
      ...DEFAULTS,
      maxSessionDurationSeconds: 60
    });
  });

  test("treats the boolean gates as strict: only literal true enables them", () => {
    expect(resolveAccessControls({ [PamPolicyType.RequireMfa]: false }).requireMfa).toBe(false);
    // a non-boolean stored value fails its schema and resolves to the default, never throws
    expect(resolveAccessControls({ [PamPolicyType.RequireMfa]: "true" }).requireMfa).toBe(false);
    expect(resolveAccessControls({ [PamPolicyType.RequireReason]: 1 }).requireReason).toBe(false);
  });

  test("drops a stored duration that fails its schema rather than passing it through", () => {
    // out of range (schema is 60..86400)
    expect(resolveAccessControls({ [PamPolicyType.MaxSessionDuration]: 10 }).maxSessionDurationSeconds).toBeNull();
    expect(resolveAccessControls({ [PamPolicyType.MaxSessionDuration]: 999999 }).maxSessionDurationSeconds).toBeNull();
    // wrong type
    expect(resolveAccessControls({ [PamPolicyType.MaxSessionDuration]: "3600" }).maxSessionDurationSeconds).toBeNull();
    // non-integer
    expect(resolveAccessControls({ [PamPolicyType.MaxSessionDuration]: 60.5 }).maxSessionDurationSeconds).toBeNull();
  });

  test("ignores unknown keys in the stored map", () => {
    expect(resolveAccessControls({ "not-a-policy": true, [PamPolicyType.RequireMfa]: true })).toEqual({
      ...DEFAULTS,
      requireMfa: true
    });
  });
});
