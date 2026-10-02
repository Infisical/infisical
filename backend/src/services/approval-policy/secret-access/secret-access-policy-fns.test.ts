import {
  getSecretAccessGrantWindow,
  hasSameAccessCriteria,
  isSecretAccessBreakGlassEligible,
  parseSecretAccessRequestData,
  validateSecretAccessConstraints
} from "./secret-access-policy-fns";
import { TSecretAccessRequestData } from "./secret-access-policy-types";

const storedRequest: TSecretAccessRequestData = {
  permissions: [["read", "secrets", { environment: "dev", secretPath: { $glob: "/app" } }]],
  isTemporary: false,
  temporaryRange: null
};

describe("validateSecretAccessConstraints", () => {
  test("accepts any request when the policy has no max time period", () => {
    expect(validateSecretAccessConstraints({ maxTimePeriod: null }, { temporaryRange: null })).toEqual({
      valid: true,
      errors: undefined
    });
    expect(validateSecretAccessConstraints({ maxTimePeriod: null }, { temporaryRange: "30d" }).valid).toBe(true);
  });

  test("rejects a permanent request under a max time period", () => {
    expect(validateSecretAccessConstraints({ maxTimePeriod: "1h" }, { temporaryRange: null })).toEqual({
      valid: false,
      errors: ["Requested access time range is limited to 1h by policy"]
    });
  });

  test("rejects a range longer than the max time period", () => {
    expect(validateSecretAccessConstraints({ maxTimePeriod: "1h" }, { temporaryRange: "2h" })).toEqual({
      valid: false,
      errors: ["Requested access time range is limited to 1h by policy"]
    });
  });

  test("accepts a range up to the max time period", () => {
    expect(validateSecretAccessConstraints({ maxTimePeriod: "1h" }, { temporaryRange: "30m" }).valid).toBe(true);
    expect(validateSecretAccessConstraints({ maxTimePeriod: "1h" }, { temporaryRange: "60m" }).valid).toBe(true);
  });
});

describe("getSecretAccessGrantWindow", () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  const inOneHour = new Date("2026-10-01T01:00:00.000Z");

  test("a request without a range is permanent", () => {
    expect(getSecretAccessGrantWindow({ isTemporary: false, temporaryRange: null }, now)).toBeNull();
  });

  test("a temporary request expires after its range", () => {
    expect(getSecretAccessGrantWindow({ isTemporary: true, temporaryRange: "1h" }, now)).toEqual({
      temporaryRange: "1h",
      startTime: now,
      endTime: inOneHour
    });
  });

  test("a range makes the access temporary even when isTemporary is false", () => {
    expect(getSecretAccessGrantWindow({ isTemporary: false, temporaryRange: "1h" }, now)).toEqual({
      temporaryRange: "1h",
      startTime: now,
      endTime: inOneHour
    });
  });

  test("a temporary request without a range is rejected", () => {
    expect(() => getSecretAccessGrantWindow({ isTemporary: true, temporaryRange: null }, now)).toThrow(
      "Temporary range is required for temporary access"
    );
  });
});

describe("hasSameAccessCriteria", () => {
  test("ignores key order inside the permission conditions", () => {
    const reordered = [["read", "secrets", { secretPath: { $glob: "/app" }, environment: "dev" }]];

    expect(hasSameAccessCriteria(storedRequest, { permissions: reordered, isTemporary: false })).toBe(true);
  });

  test("a different isTemporary is different criteria", () => {
    expect(hasSameAccessCriteria(storedRequest, { permissions: storedRequest.permissions, isTemporary: true })).toBe(
      false
    );
  });

  test("different permissions are different criteria", () => {
    const otherPath = [["read", "secrets", { environment: "dev", secretPath: { $glob: "/other" } }]];

    expect(hasSameAccessCriteria(storedRequest, { permissions: otherPath, isTemporary: false })).toBe(false);
  });

  test("unreadable stored data never matches", () => {
    expect(hasSameAccessCriteria(null, { permissions: storedRequest.permissions, isTemporary: false })).toBe(false);
  });
});

describe("isSecretAccessBreakGlassEligible", () => {
  const actorUserId = "a3c1f0e2-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
  const groupId = "0f9e8d7c-6b5a-4e3d-8c2b-1a0f9e8d7c6b";
  const actorGroupIds = new Set([groupId]);

  test("a hard policy can never be bypassed", () => {
    expect(
      isSecretAccessBreakGlassEligible({ enforcementLevel: "hard", bypassers: [], actorUserId, actorGroupIds })
    ).toBe(false);
  });

  test("a soft policy with no bypassers lets anyone bypass", () => {
    expect(
      isSecretAccessBreakGlassEligible({ enforcementLevel: "soft", bypassers: [], actorUserId, actorGroupIds })
    ).toBe(true);
  });

  test("a soft policy lets a listed user bypass", () => {
    expect(
      isSecretAccessBreakGlassEligible({
        enforcementLevel: "soft",
        bypassers: [{ type: "user", id: actorUserId }],
        actorUserId,
        actorGroupIds
      })
    ).toBe(true);
  });

  test("a soft policy lets a member of a listed group bypass", () => {
    expect(
      isSecretAccessBreakGlassEligible({
        enforcementLevel: "soft",
        bypassers: [{ type: "group", id: groupId }],
        actorUserId,
        actorGroupIds
      })
    ).toBe(true);
  });

  test("a soft policy refuses a user who is on neither list", () => {
    expect(
      isSecretAccessBreakGlassEligible({
        enforcementLevel: "soft",
        bypassers: [
          { type: "user", id: "ffffffff-0000-4000-8000-000000000000" },
          { type: "group", id: "eeeeeeee-0000-4000-8000-000000000000" }
        ],
        actorUserId,
        actorGroupIds
      })
    ).toBe(false);
  });
});
