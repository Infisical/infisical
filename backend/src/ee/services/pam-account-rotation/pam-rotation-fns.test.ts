import { describe, expect, test, vi } from "vitest";

import { PamAccountType } from "../pam/pam-enums";
import {
  computeNextRotationAt,
  getRotationReadiness,
  isRotatableAccountType,
  PamRotationReadinessIssue,
  withGatewayRetry
} from "./pam-rotation-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

describe("isRotatableAccountType", () => {
  test("accepts the three SQL types", () => {
    expect(isRotatableAccountType(PamAccountType.Postgres)).toBe(true);
    expect(isRotatableAccountType(PamAccountType.MySQL)).toBe(true);
    expect(isRotatableAccountType(PamAccountType.MsSQL)).toBe(true);
  });

  test("accepts Windows local and domain accounts", () => {
    expect(isRotatableAccountType(PamAccountType.Windows)).toBe(true);
    expect(isRotatableAccountType(PamAccountType.WindowsAd)).toBe(true);
  });

  test("rejects non-rotatable types", () => {
    expect(isRotatableAccountType(PamAccountType.SSH)).toBe(false);
    expect(isRotatableAccountType(PamAccountType.AwsIam)).toBe(false);
    expect(isRotatableAccountType(PamAccountType.Redis)).toBe(false);
  });
});

describe("getRotationReadiness", () => {
  const base = {
    accountId: "acc-1",
    accountType: PamAccountType.Postgres,
    credentialConfigured: true
  };

  test("ready regardless of the automatic-rotation toggle (manual is always available once configured)", () => {
    const r = getRotationReadiness({ ...base, rotationAccountId: "acc-1" });
    expect(r).toEqual({ ready: true });
  });

  test("not ready for an unsupported account type", () => {
    const r = getRotationReadiness({ ...base, accountType: PamAccountType.SSH, rotationAccountId: "acc-1" });
    expect(r).toEqual({ ready: false, issue: PamRotationReadinessIssue.UnsupportedType });
  });

  test("not ready when no rotation account is configured", () => {
    const r = getRotationReadiness({ ...base, rotationAccountId: null });
    expect(r).toEqual({ ready: false, issue: PamRotationReadinessIssue.NotConfigured });
  });

  test("not ready for self-rotation without a stored credential", () => {
    const r = getRotationReadiness({ ...base, rotationAccountId: "acc-1", credentialConfigured: false });
    expect(r).toEqual({ ready: false, issue: PamRotationReadinessIssue.SelfRotationNoCredential });
  });

  test("ready for self-rotation with a stored credential", () => {
    const r = getRotationReadiness({ ...base, rotationAccountId: "acc-1", credentialConfigured: true });
    expect(r).toEqual({ ready: true });
  });

  test("ready for delegated rotation even without the target's own credential", () => {
    const r = getRotationReadiness({ ...base, rotationAccountId: "acc-2", credentialConfigured: false });
    expect(r).toEqual({ ready: true });
  });
});

describe("computeNextRotationAt", () => {
  const now = new Date("2026-07-01T00:00:00.000Z");
  const interval = 86400; // 1 day

  test("schedules one interval after the anchor when the anchor is recent", () => {
    const anchor = new Date("2026-06-30T23:00:00.000Z"); // 23h ago, so anchor+1d is in the future
    const next = computeNextRotationAt({ anchor, intervalSeconds: interval, now, jitterCapSeconds: 0 });
    expect(next.getTime()).toBe(anchor.getTime() + interval * 1000);
  });

  test("clamps to now when anchor + interval is already in the past", () => {
    const anchor = new Date("2026-06-01T00:00:00.000Z"); // long ago
    const next = computeNextRotationAt({ anchor, intervalSeconds: interval, now, jitterCapSeconds: 0 });
    expect(next.getTime()).toBe(now.getTime());
  });

  test("uses now as the anchor when none is given", () => {
    const next = computeNextRotationAt({ anchor: null, intervalSeconds: interval, now, jitterCapSeconds: 0 });
    expect(next.getTime()).toBe(now.getTime() + interval * 1000);
  });

  test("keeps jitter within the cap", () => {
    const anchor = new Date("2026-06-30T23:00:00.000Z");
    const cap = 3600;
    const baseline = anchor.getTime() + interval * 1000;
    for (let i = 0; i < 50; i += 1) {
      const next = computeNextRotationAt({ anchor, intervalSeconds: interval, now, jitterCapSeconds: cap });
      expect(next.getTime()).toBeGreaterThanOrEqual(baseline);
      expect(next.getTime()).toBeLessThanOrEqual(baseline + cap * 1000);
    }
  });
});

describe("withGatewayRetry", () => {
  test("retries a transport failure", async () => {
    let attempts = 0;
    const result = await withGatewayRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("dial tcp: i/o timeout");
        return true;
      },
      "verify",
      { baseDelayMs: 0 }
    );

    expect(result).toBe(true);
    expect(attempts).toBe(3);
  });

  test("gives up immediately when the target rejected the credential", async () => {
    let attempts = 0;
    const authErr = Object.assign(new Error("WinRM authentication failed"), { gatewayFailureKind: "auth" });

    await expect(
      withGatewayRetry(
        async () => {
          attempts += 1;
          throw authErr;
        },
        "verify",
        { baseDelayMs: 0 }
      )
    ).rejects.toThrow("WinRM authentication failed");
    expect(attempts).toBe(1);
  });
});
