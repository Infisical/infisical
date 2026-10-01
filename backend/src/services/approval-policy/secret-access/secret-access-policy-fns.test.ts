import {
  getSecretAccessGrantWindow,
  hasSameAccessCriteria,
  validateSecretAccessConstraints
} from "./secret-access-policy-fns";
import { TSecretAccessRequestData } from "./secret-access-policy-types";

const storedRequest: TSecretAccessRequestData = {
  envId: "7b8f3a52-91c4-4d0e-9a6b-2f1c5e8d4a73",
  envSlug: "dev",
  secretPath: "/app",
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
