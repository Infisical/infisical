import { describe, expect, test, vi } from "vitest";

import { TPlanFeatures as TLicensePlan } from "@app/domains/platform/license/ce/module";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { ObjectStorageType } from "@app/services/object-storage/object-storage-types";

import { getSessionLogEntitlement, getSessionLogRetentionDays } from "./agent-vault-session-log-license-fns";

vi.mock("@app/lib/logger", () => ({ logger: { warn: () => {} } }));

describe("getSessionLogEntitlement", () => {
  type TPlanFeatures = { hasExternal: boolean; hasDefault: boolean; retentionDays?: number | null };
  const toPlan = ({ hasExternal, hasDefault, retentionDays = null }: TPlanFeatures) =>
    ({
      ...testFeatures(),
      agentVaultByoS3: hasExternal,
      agentVaultManagedStorage: hasDefault,
      agentVaultSessionLogRetentionDays: retentionDays
    }) as TLicensePlan;
  const license = ({ plan, fallback = false }: { plan: TPlanFeatures; fallback?: boolean }) => {
    const fake = new FakeLicenseService().setPlan("org-1", toPlan(plan));
    if (fallback) fake.fallbackOrgs.add("org-1");
    return fake;
  };

  const free = { hasExternal: false, hasDefault: true };
  const paid = { hasExternal: true, hasDefault: true, retentionDays: 365 };
  const none = { hasExternal: false, hasDefault: false };

  test.each([
    { why: "a paid plan", service: { plan: paid }, expected: "licensed" },
    { why: "a real free plan", service: { plan: free }, expected: "unlicensed" },
    { why: "a fallback", service: { plan: free, fallback: true }, expected: "unknown" }
  ])("external storage: reads $why as $expected", async ({ service, expected }) => {
    expect((await getSessionLogEntitlement(license(service), "org-1", ObjectStorageType.External)).entitlement).toBe(
      expected
    );
  });

  test.each([
    { why: "a plan with default storage", service: { plan: free }, expected: "licensed" },
    { why: "a plan without it", service: { plan: none }, expected: "unlicensed" },
    {
      why: "a fallback, which includes it",
      service: { plan: free, fallback: true },
      expected: "licensed"
    }
  ])("default storage: reads $why as $expected", async ({ service, expected }) => {
    expect((await getSessionLogEntitlement(license(service), "org-1", ObjectStorageType.Default)).entitlement).toBe(
      expected
    );
  });

  test("a fallback answers unknown with no plan to take retention from", async () => {
    const { entitlement, plan } = await getSessionLogEntitlement(
      license({ plan: free, fallback: true }),
      "org-1",
      ObjectStorageType.External
    );
    expect([entitlement, plan]).toEqual(["unknown", null]);
  });

  test("retention is 30 days when the plan doesn't say", () => {
    expect(getSessionLogRetentionDays({ agentVaultSessionLogRetentionDays: null })).toBe(30);
    expect(getSessionLogRetentionDays(null)).toBe(30);
  });
});
