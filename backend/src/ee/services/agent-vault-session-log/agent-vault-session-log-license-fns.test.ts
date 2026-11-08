import { describe, expect, test, vi } from "vitest";

import { TPlanProps as TLicensePlan } from "@app/domains/platform/license/ce/module";
import { FakeLicenseDomain } from "@app/domains/platform/license/ce/testing/fake-license-domain";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { ObjectStorageType } from "@app/services/object-storage/object-storage-types";

import { getSessionLogEntitlement, getSessionLogRetentionDays } from "./agent-vault-session-log-license-fns";

vi.mock("@app/lib/logger", () => ({ logger: { warn: () => {} } }));

describe("getSessionLogEntitlement", () => {
  type TPlanProps = { hasExternal: boolean; hasDefault: boolean; retentionDays?: number | null };
  const toPlan = ({ hasExternal, hasDefault, retentionDays = null }: TPlanProps) =>
    ({
      ...testFeatures(),
      agentVaultByoS3: hasExternal,
      agentVaultManagedStorage: hasDefault,
      agentVaultSessionLogRetentionDays: retentionDays
    }) as TLicensePlan;
  const license = ({
    plan,
    fallback = false,
    lastKnown = null
  }: {
    plan: TPlanProps;
    fallback?: boolean;
    lastKnown?: { plan: TPlanProps; ageMs: number } | null;
  }) => {
    const fake = new FakeLicenseDomain().setPlan("org-1", toPlan(plan));
    if (fallback) fake.fallbackOrgs.add("org-1");
    if (lastKnown)
      fake.lastKnown.set("org-1", { plan: toPlan(lastKnown.plan), fetchedAt: Date.now() - lastKnown.ageMs });
    return fake;
  };

  const free = { hasExternal: false, hasDefault: true };
  const paid = { hasExternal: true, hasDefault: true, retentionDays: 365 };
  const none = { hasExternal: false, hasDefault: false };

  test.each([
    { why: "a paid plan", service: { plan: paid }, expected: "licensed" },
    { why: "a real free plan", service: { plan: free }, expected: "unlicensed" },
    {
      why: "a fallback with a recent paid answer",
      service: { plan: free, fallback: true, lastKnown: { plan: paid, ageMs: 10 * 60_000 } },
      expected: "licensed"
    },
    {
      why: "a fallback with a recent free answer",
      service: { plan: free, fallback: true, lastKnown: { plan: free, ageMs: 10 * 60_000 } },
      expected: "unlicensed"
    },
    {
      why: "a fallback whose last answer is over an hour old",
      service: { plan: free, fallback: true, lastKnown: { plan: paid, ageMs: 61 * 60_000 } },
      expected: "unknown"
    },
    { why: "a fallback with no real answer on record", service: { plan: free, fallback: true }, expected: "unknown" }
  ])("external storage: reads $why as $expected", async ({ service, expected }) => {
    expect((await getSessionLogEntitlement(license(service), "org-1", ObjectStorageType.External)).entitlement).toBe(
      expected
    );
  });

  test.each([
    { why: "a plan with default storage", service: { plan: free }, expected: "licensed" },
    { why: "a plan without it", service: { plan: none }, expected: "unlicensed" },
    {
      why: "a fallback whose recent real answer leaves it out",
      service: { plan: free, fallback: true, lastKnown: { plan: none, ageMs: 10 * 60_000 } },
      expected: "unlicensed"
    },
    {
      why: "a fallback with no real answer, which includes it",
      service: { plan: free, fallback: true },
      expected: "licensed"
    }
  ])("default storage: reads $why as $expected", async ({ service, expected }) => {
    expect((await getSessionLogEntitlement(license(service), "org-1", ObjectStorageType.Default)).entitlement).toBe(
      expected
    );
  });

  test("during an outage, uploads keep the retention of the last real plan", async () => {
    const { plan } = await getSessionLogEntitlement(
      license({ plan: free, fallback: true, lastKnown: { plan: paid, ageMs: 10 * 60_000 } }),
      "org-1",
      ObjectStorageType.Default
    );
    expect(getSessionLogRetentionDays(plan)).toBe(365);
  });

  test("after the first hour of an outage, retention still comes from the last real plan", async () => {
    const { entitlement, plan } = await getSessionLogEntitlement(
      license({ plan: free, fallback: true, lastKnown: { plan: paid, ageMs: 3 * 60 * 60_000 } }),
      "org-1",
      ObjectStorageType.Default
    );
    expect(entitlement).toBe("licensed");
    expect(getSessionLogRetentionDays(plan)).toBe(365);
  });

  test("retention is 30 days when the plan doesn't say", () => {
    expect(getSessionLogRetentionDays({ agentVaultSessionLogRetentionDays: null })).toBe(30);
    expect(getSessionLogRetentionDays(null)).toBe(30);
  });
});
