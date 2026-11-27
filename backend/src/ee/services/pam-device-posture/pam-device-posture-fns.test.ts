import { describe, expect, test } from "vitest";

import { PamDevicePostureCheck, PamDevicePostureProvider } from "./pam-device-posture-enums";
import {
  compareVersions,
  evaluateDevicePosture,
  evaluateRipplingChecks,
  toRipplingDeviceFacts
} from "./pam-device-posture-fns";
import { PamDevicePosturePolicySchema, TPamRipplingPostureProvider } from "./pam-device-posture-schemas";

const NOW = new Date("2026-11-27T12:00:00Z");
const CONNECTION_ID = "6c3f6a8e-1b1a-4a55-9a8a-0b4f2a2f3c11";

const device = (overrides: Record<string, unknown> = {}) => ({
  worker_id: "worker-1",
  platform: "MACOS",
  model: "MacBookPro18,3",
  os_name: "macOS",
  os_version: "15.4.1",
  lifecycle_state: "ACTIVE",
  enrollment_status: "ENROLLED",
  is_managed: true,
  is_encrypted: true,
  last_checkin_at: "2026-11-27T11:30:00Z",
  pending_actions: [],
  ...overrides
});

const worker = { id: "worker-1", status: "ACTIVE" };

const config = (checks: Partial<TPamRipplingPostureProvider["checks"]> = {}): TPamRipplingPostureProvider => ({
  provider: PamDevicePostureProvider.Rippling,
  connectionId: CONNECTION_ID,
  checks: {
    [PamDevicePostureCheck.DiskEncrypted]: true,
    [PamDevicePostureCheck.NoPendingOsUpdate]: true,
    [PamDevicePostureCheck.MinimumOsVersion]: { macos: "15.0" },
    [PamDevicePostureCheck.RecentCheckIn]: { maxHours: 24 },
    ...checks
  }
});

const facts = (deviceOverrides?: Record<string, unknown>, workerOverride: typeof worker | null = worker) =>
  toRipplingDeviceFacts({ serial: "C02X", device: device(deviceOverrides) as never, worker: workerOverride });

describe("evaluateRipplingChecks", () => {
  test("passes a compliant device", () => {
    const results = evaluateRipplingChecks(config(), facts(), NOW);
    expect(results.map((r) => [r.check, r.passed])).toEqual([
      [PamDevicePostureCheck.ManagedDevice, true],
      [PamDevicePostureCheck.DiskEncrypted, true],
      [PamDevicePostureCheck.MinimumOsVersion, true],
      [PamDevicePostureCheck.NoPendingOsUpdate, true],
      [PamDevicePostureCheck.RecentCheckIn, true]
    ]);
  });

  test("stops at the managed device check when the serial isn't in Rippling", () => {
    const results = evaluateRipplingChecks(
      config(),
      toRipplingDeviceFacts({ serial: "C02X", device: null, worker }),
      NOW
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ check: PamDevicePostureCheck.ManagedDevice, passed: false });
  });

  test.each([
    ["assigned to someone else", { worker_id: "worker-2" }, worker],
    ["not enrolled", { enrollment_status: "UNENROLLED" }, worker],
    ["locked", { lifecycle_state: "LOCKED" }, worker],
    ["lost", { lifecycle_state: "LOST" }, worker],
    ["terminated worker", {}, { id: "worker-1", status: "TERMINATED" }],
    ["unknown worker", {}, null]
  ])("fails the managed device check when %s", (_, overrides, w) => {
    const [managed] = evaluateRipplingChecks(config(), facts(overrides, w), NOW);
    expect(managed).toMatchObject({ check: PamDevicePostureCheck.ManagedDevice, passed: false });
  });

  test("fails each optional check on its own fact", () => {
    const results = evaluateRipplingChecks(
      config(),
      facts({
        is_encrypted: false,
        os_version: "14.6.1",
        pending_actions: [{ action_type: "UPDATE_OS", state: "PENDING" }],
        last_checkin_at: "2026-11-18T12:00:00Z"
      }),
      NOW
    );
    expect(results.filter((r) => !r.passed).map((r) => r.check)).toEqual([
      PamDevicePostureCheck.DiskEncrypted,
      PamDevicePostureCheck.MinimumOsVersion,
      PamDevicePostureCheck.NoPendingOsUpdate,
      PamDevicePostureCheck.RecentCheckIn
    ]);
  });

  test("ignores finished OS update actions and checks that are off", () => {
    const results = evaluateRipplingChecks(
      config({
        [PamDevicePostureCheck.DiskEncrypted]: false,
        [PamDevicePostureCheck.MinimumOsVersion]: null,
        [PamDevicePostureCheck.RecentCheckIn]: null
      }),
      facts({ is_encrypted: false, pending_actions: [{ action_type: "UPDATE_OS", state: "COMPLETED" }] }),
      NOW
    );
    expect(results.map((r) => [r.check, r.passed])).toEqual([
      [PamDevicePostureCheck.ManagedDevice, true],
      [PamDevicePostureCheck.NoPendingOsUpdate, true]
    ]);
  });

  test("skips a minimum version not set for the device's platform", () => {
    const results = evaluateRipplingChecks(
      config({ [PamDevicePostureCheck.MinimumOsVersion]: { windows: "10.0.22631" } }),
      facts(),
      NOW
    );
    expect(results.some((r) => r.check === PamDevicePostureCheck.MinimumOsVersion)).toBe(false);
  });
});

describe("evaluateDevicePosture", () => {
  const policy = { providers: [config()] };

  test("reports the provider's error and fails closed", () => {
    const result = evaluateDevicePosture(policy, { [CONNECTION_ID]: { error: "Couldn't reach Rippling" } }, NOW);
    expect(result).toMatchObject({ passed: false, error: "Couldn't reach Rippling" });
  });

  test("fails closed when the connection wasn't looked up", () => {
    expect(evaluateDevicePosture(policy, {}, NOW).passed).toBe(false);
  });

  test("passes when every check passes", () => {
    expect(evaluateDevicePosture(policy, { [CONNECTION_ID]: { facts: facts() } }, NOW).passed).toBe(true);
  });
});

describe("PamDevicePosturePolicySchema", () => {
  test("rejects an empty provider list and malformed versions", () => {
    expect(PamDevicePosturePolicySchema.safeParse({ providers: [] }).success).toBe(false);
    expect(
      PamDevicePosturePolicySchema.safeParse({
        providers: [{ ...config(), checks: { [PamDevicePostureCheck.MinimumOsVersion]: { macos: "15.x" } } }]
      }).success
    ).toBe(false);
  });
});

test("compareVersions compares numerically", () => {
  expect(compareVersions("15.10", "15.9")).toBeGreaterThan(0);
  expect(compareVersions("10.0.22631", "10.0.22631.0")).toBe(0);
  expect(compareVersions("14.6.1", "15.0")).toBeLessThan(0);
});
