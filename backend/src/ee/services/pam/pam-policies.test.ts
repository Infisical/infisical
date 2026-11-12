import RE2 from "re2";
import { describe, expect, test } from "vitest";

import { accountTypeSupportsSessionLogMasking, PamAccountType } from "./pam-enums";
import {
  buildPamPolicyRules,
  getApplicablePolicies,
  PAM_OUTPUT_MASKING_PRESET_PATTERNS,
  PamOutputMaskingPreset,
  PamPolicyType,
  PamSettingType,
  resolveAccessControls,
  resolveOutputMasking,
  validatePolicyValues
} from "./pam-policies";

describe("getApplicablePolicies", () => {
  test("returns the universal policies for any account type", () => {
    const keys = getApplicablePolicies(PamAccountType.Postgres).map((p) => p.key);
    expect(keys).toContain(PamPolicyType.RequireMfa);
    expect(keys).toContain(PamPolicyType.AllowBreakGlass);
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
    allowAutoApproval: false,
    allowBreakGlass: false,
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
    ).toEqual({ ...DEFAULTS, requireReason: true, requireMfa: true, maxSessionDurationSeconds: 3600 });
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

  test("break-glass only resolves alongside the approval it exists to skip", () => {
    expect(
      resolveAccessControls({
        [PamPolicyType.RequiresApproval]: true,
        [PamPolicyType.AllowBreakGlass]: true
      }).allowBreakGlass
    ).toBe(true);
    expect(resolveAccessControls({ [PamPolicyType.AllowBreakGlass]: true }).allowBreakGlass).toBe(false);
    expect(
      resolveAccessControls({
        [PamPolicyType.RequiresApproval]: true,
        [PamPolicyType.AllowBreakGlass]: "true"
      }).allowBreakGlass
    ).toBe(false);
  });

  test("auto-approval only resolves alongside the approval it decides", () => {
    expect(
      resolveAccessControls({
        [PamPolicyType.RequiresApproval]: true,
        [PamPolicyType.AllowAutoApproval]: true
      }).allowAutoApproval
    ).toBe(true);
    expect(resolveAccessControls({ [PamPolicyType.AllowAutoApproval]: true }).allowAutoApproval).toBe(false);
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

describe("buildPamPolicyRules", () => {
  const empty = { commandBlockingPatterns: [], maskingPatterns: [], maskingBuiltInDetection: false };

  test("returns null when nothing is configured", () => {
    expect(buildPamPolicyRules(empty)).toBeNull();
  });

  test("emits command blocking on its own", () => {
    expect(buildPamPolicyRules({ ...empty, commandBlockingPatterns: ["rm\\s+-rf"] })).toEqual({
      [PamPolicyType.CommandBlocking]: { patterns: ["rm\\s+-rf"] }
    });
  });

  // Must serialize exactly as it did before built-in detection existed.
  test("emits custom masking patterns with detection off", () => {
    expect(buildPamPolicyRules({ ...empty, maskingPatterns: ["password=\\S+"] })).toEqual({
      [PamSettingType.SessionLogMasking]: { patterns: ["password=\\S+"], builtInDetection: false }
    });
  });

  // The case the old shape could not express.
  test("emits the masking rule for detection alone", () => {
    expect(buildPamPolicyRules({ ...empty, maskingBuiltInDetection: true })).toEqual({
      [PamSettingType.SessionLogMasking]: { patterns: [], builtInDetection: true }
    });
  });

  test("emits both arms together", () => {
    expect(
      buildPamPolicyRules({
        commandBlockingPatterns: ["shutdown"],
        maskingPatterns: ["token=\\S+"],
        maskingBuiltInDetection: true
      })
    ).toEqual({
      [PamPolicyType.CommandBlocking]: { patterns: ["shutdown"] },
      [PamSettingType.SessionLogMasking]: { patterns: ["token=\\S+"], builtInDetection: true }
    });
  });
});

describe("accountTypeSupportsSessionLogMasking", () => {
  // RDP recordings are base64 frames, and AWS IAM is gateway-less so it has no session log.
  const unmaskable = [PamAccountType.Windows, PamAccountType.WindowsAd, PamAccountType.AwsIam];

  test("is false for types with no maskable session log", () => {
    expect(unmaskable.every((type) => !accountTypeSupportsSessionLogMasking(type))).toBe(true);
  });

  test("is true for everything else", () => {
    const rest = Object.values(PamAccountType).filter((type) => !unmaskable.includes(type));
    expect(rest.every(accountTypeSupportsSessionLogMasking)).toBe(true);
  });
});

describe("output masking presets", () => {
  const masks = (preset: keyof typeof PAM_OUTPUT_MASKING_PRESET_PATTERNS, value: string) =>
    new RE2(PAM_OUTPUT_MASKING_PRESET_PATTERNS[preset]).test(value);

  test.each<[keyof typeof PAM_OUTPUT_MASKING_PRESET_PATTERNS, string]>([
    [PamOutputMaskingPreset.Email, "jane.doe+billing@corp.example.co.uk"],
    [PamOutputMaskingPreset.PhoneNumber, "(555) 123-4567"],
    [PamOutputMaskingPreset.PhoneNumber, "+44 20 7946 0958"],
    [PamOutputMaskingPreset.PhoneNumber, "+14155552671"],
    [PamOutputMaskingPreset.Ssn, "123-45-6789"],
    [PamOutputMaskingPreset.IpAddress, "10.20.30.40"],
    [PamOutputMaskingPreset.Jwt, "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln"],
    [PamOutputMaskingPreset.ConnectionString, "postgres://app:hunter2@db:5432/app"],
    [PamOutputMaskingPreset.ConnectionString, "redis://:hunter2@cache:6379"]
  ])("%s masks %s", (preset, value) => {
    expect(masks(preset, value)).toBe(true);
  });

  // A broader pattern would also hit these, blanking ordinary query output.
  test.each(["2026-11-10", "1731300000000", "ORD-2026-000123", "10.0.1", "12:30:45", "https://example.com:8443/a"])(
    "no preset masks %s",
    (value) => {
      expect(
        (Object.keys(PAM_OUTPUT_MASKING_PRESET_PATTERNS) as (keyof typeof PAM_OUTPUT_MASKING_PRESET_PATTERNS)[]).some(
          (preset) => masks(preset, value)
        )
      ).toBe(false);
    }
  );

  test("connection string matches stay inside one URL's credentials", () => {
    const matches = (value: string) =>
      new RE2(PAM_OUTPUT_MASKING_PRESET_PATTERNS[PamOutputMaskingPreset.ConnectionString], "g").match(value);
    expect(matches(`{"url":"https://example.com:8443/a","email":"jane@corp.com"}`)).toBeNull();
    expect(matches(`{"a":"https://u:p1@h1/x","b":"https://u:p2@h2/y"}`)).toEqual(["https://u:p1@", "https://u:p2@"]);
    expect(matches("postgres://app:p@ss@db:5432/app")).toEqual(["postgres://app:p@ss@"]);
  });

  test("dedupes presets and caps the list at the number of presets", () => {
    expect(
      validatePolicyValues(PamAccountType.SSH, { [PamPolicyType.OutputMasking]: { presets: ["email", "email"] } })
    ).toEqual({ ok: true, data: { [PamPolicyType.OutputMasking]: { presets: ["email"], patterns: "" } } });
    expect(
      validatePolicyValues(PamAccountType.SSH, { [PamPolicyType.OutputMasking]: { presets: Array(9).fill("email") } })
        .ok
    ).toBe(false);
  });
});

describe("resolveOutputMasking", () => {
  test("sends the card preset as a flag, since the gateway checks the Luhn checksum", () => {
    expect(
      resolveOutputMasking({
        [PamPolicyType.OutputMasking]: { presets: [PamOutputMaskingPreset.CreditCard], patterns: "" }
      })
    ).toEqual({ patterns: [], accountCredentials: false, creditCards: true });
  });

  test("sends the account credentials preset as a flag for the gateway, not a pattern", () => {
    expect(
      resolveOutputMasking({
        [PamPolicyType.OutputMasking]: { presets: [PamOutputMaskingPreset.AccountCredentials], patterns: "" }
      })
    ).toEqual({ patterns: [], accountCredentials: true, creditCards: false });
  });
});
