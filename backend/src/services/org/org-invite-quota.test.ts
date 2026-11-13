import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Plan, PlanLimit } from "@app/domains/platform/license/ce/module";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { BadRequestError, DailyQuotaExceededError } from "@app/lib/errors";

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
    incrementBy: vi.fn(async (key: string, value: number) => {
      const next = (counters.get(key) ?? 0) + value;
      counters.set(key, next);
      return next;
    }),
    getItemPrimary: vi.fn(async (key: string) => {
      const value = counters.get(key);
      return value === undefined ? null : String(value);
    })
  };
};

const FREE_IDENTITY_LIMIT = 5;

describe("orgInviteQuota.admit", () => {
  let keyStore: ReturnType<typeof fakeKeyStore>;
  let licenseService: FakeLicenseService;
  const orgMembershipDAL = { countSeatHolders: vi.fn(async () => 0) };

  beforeEach(() => {
    appConfig.isCloud = true;
    keyStore = fakeKeyStore();
    licenseService = new FakeLicenseService().setPlan(ORG_ID, { slug: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const quota = () => orgInviteQuotaFactory({ keyStore, licenseService, orgMembershipDAL });

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

  test("gives a released reservation back to today's budget", async () => {
    // Setup
    const { admit } = quota();
    await admit(ORG_ID, FREE_ORG_DAILY_INVITE_LIMIT - 10);
    const reservation = await admit(ORG_ID, 10);

    // Action
    await reservation.release();

    // Assert
    expect([...keyStore.counters.values()]).toEqual([FREE_ORG_DAILY_INVITE_LIMIT - 10]);
    await admit(ORG_ID, 10);
  });
});

describe("orgInviteQuota seats", () => {
  let licenseService: FakeLicenseService;
  const countSeatHolders = vi.fn(async () => 0);
  const tx = { raw: vi.fn() };

  beforeEach(() => {
    appConfig.isCloud = true;
    countSeatHolders.mockReset().mockResolvedValue(0);
    tx.raw.mockReset();
    licenseService = new FakeLicenseService().setPlan(ORG_ID, { slug: null, identityLimit: FREE_IDENTITY_LIMIT });
  });

  const quota = () =>
    orgInviteQuotaFactory({ keyStore: fakeKeyStore(), licenseService, orgMembershipDAL: { countSeatHolders } });

  const freePlan = () => Plan.restore({ ...testFeatures(), slug: null, identityLimit: FREE_IDENTITY_LIMIT });

  const assertSeats = (count: number, held: number) => {
    countSeatHolders.mockResolvedValue(held);
    return quota().assertSeatsForInvites({ orgId: ORG_ID, plan: freePlan(), count }, tx as never);
  };

  test("holds seats on a free cloud org with an identity limit", async () => {
    // Setup
    const { getSeatPlan } = quota();

    // Action
    const plan = await getSeatPlan(ORG_ID);

    // Assert
    expect(plan?.limit(PlanLimit.Identities)).toBe(FREE_IDENTITY_LIMIT);
  });

  test("holds no seats on a paid org, even with an identity limit", async () => {
    // Setup
    licenseService.setPlan(ORG_ID, { slug: "pro", identityLimit: FREE_IDENTITY_LIMIT });

    // Action
    const plan = await quota().getSeatPlan(ORG_ID);

    // Assert
    expect(plan).toBeNull();
  });

  test("holds no seats on a self-hosted instance", async () => {
    // Setup
    appConfig.isCloud = false;

    // Action
    const plan = await quota().getSeatPlan(ORG_ID);

    // Assert
    expect(plan).toBeNull();
  });

  test("lets invitees fill the seats left, counted under the org's lock", async () => {
    // Action
    const result = assertSeats(2, FREE_IDENTITY_LIMIT - 2);

    // Assert
    await expect(result).resolves.toBeUndefined();
    expect(tx.raw).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), [expect.any(Number)]);
    expect(countSeatHolders).toHaveBeenCalledWith(ORG_ID, tx);
  });

  test("refuses invitees the seats left cannot hold, and says how many fit", async () => {
    // Action
    const result = assertSeats(2, FREE_IDENTITY_LIMIT - 1);

    // Assert
    await expect(result).rejects.toThrow(BadRequestError);
    await expect(assertSeats(2, FREE_IDENTITY_LIMIT - 1)).rejects.toThrow("has 1 left");
  });

  test("tells a full free org to revoke a pending invitation", async () => {
    // Action
    const result = assertSeats(1, FREE_IDENTITY_LIMIT);

    // Assert
    await expect(result).rejects.toThrow("has none left. Revoke a pending invitation");
  });

  test("does nothing without a seat plan", async () => {
    // Action
    await quota().assertSeatsForInvites({ orgId: ORG_ID, plan: null, count: 3 }, tx as never);

    // Assert
    expect(tx.raw).not.toHaveBeenCalled();
    expect(countSeatHolders).not.toHaveBeenCalled();
  });
});
