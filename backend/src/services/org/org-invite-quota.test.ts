import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { DailyQuotaExceededError } from "@app/lib/errors";

import { FREE_ORG_DAILY_INVITE_LIMIT, orgInviteQuotaFactory } from "./org-invite-quota";

const appConfig = { isCloud: true };
vi.mock("@app/lib/config/env", () => ({
  getConfig: () => appConfig
}));
vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const ORG_ID = "org-id";

// Same all-or-nothing semantics as the Redis script.
const fakeKeyStore = () => {
  const counters = new Map<string, number>();
  return {
    counters,
    incrementByIfUnderLimitWithFixedExpiry: vi.fn(async (key: string, value: number, limit: number) => {
      const current = counters.get(key) ?? 0;
      if (current + value > limit) return -1;
      counters.set(key, current + value);
      return current + value;
    }),
    getItem: vi.fn(async (key: string) => {
      const value = counters.get(key);
      return value === undefined ? null : String(value);
    })
  };
};

describe("orgInviteQuota.admit", () => {
  let keyStore: ReturnType<typeof fakeKeyStore>;
  let licenseService: FakeLicenseService;

  beforeEach(() => {
    appConfig.isCloud = true;
    keyStore = fakeKeyStore();
    licenseService = new FakeLicenseService().setPlan(ORG_ID, { slug: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const quota = () => orgInviteQuotaFactory({ keyStore, licenseService });

  test("admits a free cloud org up to the daily limit", async () => {
    // Setup
    const { admit } = quota();

    // Action
    await admit(ORG_ID, FREE_ORG_DAILY_INVITE_LIMIT - 1);
    await admit(ORG_ID, 1);

    // Assert
    expect([...keyStore.counters.values()]).toEqual([FREE_ORG_DAILY_INVITE_LIMIT]);
  });

  test("refuses the invite that would go over the limit and consumes nothing", async () => {
    // Setup
    const { admit } = quota();
    await admit(ORG_ID, FREE_ORG_DAILY_INVITE_LIMIT - 3);

    // Action
    const result = admit(ORG_ID, 5);

    // Assert
    await expect(result).rejects.toThrow(DailyQuotaExceededError);
    await expect(admit(ORG_ID, 5)).rejects.toThrow("has 3 left today");
    expect([...keyStore.counters.values()]).toEqual([FREE_ORG_DAILY_INVITE_LIMIT - 3]);
  });

  test("starts a new count on the next UTC day", async () => {
    // Setup
    vi.useFakeTimers({ now: new Date("2026-11-13T23:59:00Z"), toFake: ["Date"] });
    const { admit } = quota();
    await admit(ORG_ID, FREE_ORG_DAILY_INVITE_LIMIT);
    await expect(admit(ORG_ID, 1)).rejects.toThrow("sent all of today's");

    // Action
    vi.setSystemTime(new Date("2026-11-14T00:01:00Z"));
    await admit(ORG_ID, 1);

    // Assert
    expect(keyStore.counters.size).toBe(2);
  });

  test("does not cap a paid org", async () => {
    // Setup
    licenseService.setPlan(ORG_ID, { slug: "pro" });
    const { admit } = quota();

    // Action
    await admit(ORG_ID, FREE_ORG_DAILY_INVITE_LIMIT + 1);

    // Assert
    expect(keyStore.incrementByIfUnderLimitWithFixedExpiry).not.toHaveBeenCalled();
  });

  test("does not cap a paid org while its plan is served from the fallback", async () => {
    // Setup
    licenseService.fallbackOrgs.add(ORG_ID);
    licenseService.lastKnown.set(ORG_ID, { plan: { ...testFeatures(), slug: "pro" }, fetchedAt: Date.now() });
    const { admit } = quota();

    // Action
    await admit(ORG_ID, FREE_ORG_DAILY_INVITE_LIMIT + 1);

    // Assert
    expect(keyStore.incrementByIfUnderLimitWithFixedExpiry).not.toHaveBeenCalled();
  });

  test("does not cap a self-hosted instance", async () => {
    // Setup
    appConfig.isCloud = false;
    const { admit } = quota();

    // Action
    await admit(ORG_ID, FREE_ORG_DAILY_INVITE_LIMIT + 1);

    // Assert
    expect(keyStore.incrementByIfUnderLimitWithFixedExpiry).not.toHaveBeenCalled();
  });
});
