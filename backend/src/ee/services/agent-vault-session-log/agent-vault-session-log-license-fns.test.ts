import { describe, expect, test } from "vitest";

import { TPlanFeatures as TLicensePlan } from "@app/domains/platform/license/ce/module";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { ObjectStorageType } from "@app/services/object-storage/object-storage-types";

import { getSessionLogEntitlement, getSessionLogRetentionDays } from "./agent-vault-session-log-license-fns";

describe("getSessionLogEntitlement", () => {
  type TPlanFeatures = { hasExternal: boolean; hasDefault: boolean; retentionDays?: number | null };
  const toPlan = ({ hasExternal, hasDefault, retentionDays = null }: TPlanFeatures) =>
    ({
      ...testFeatures(),
      agentVaultByoS3: hasExternal,
      agentVaultManagedStorage: hasDefault,
      agentVaultSessionLogRetentionDays: retentionDays
    }) as TLicensePlan;
  const license = ({ plan }: { plan: TPlanFeatures }) => new FakeLicenseService().setPlan("org-1", toPlan(plan));

  const free = { hasExternal: false, hasDefault: true };
  const paid = { hasExternal: true, hasDefault: true, retentionDays: 365 };
  const none = { hasExternal: false, hasDefault: false };

  test.each([
    { why: "a paid plan", service: { plan: paid }, expected: "licensed" },
    { why: "a free plan", service: { plan: free }, expected: "unlicensed" }
  ])("external storage: reads $why as $expected", async ({ service, expected }) => {
    expect((await getSessionLogEntitlement(license(service), "org-1", ObjectStorageType.External)).entitlement).toBe(
      expected
    );
  });

  test.each([
    { why: "a plan with default storage", service: { plan: free }, expected: "licensed" },
    { why: "a plan without it", service: { plan: none }, expected: "unlicensed" }
  ])("default storage: reads $why as $expected", async ({ service, expected }) => {
    expect((await getSessionLogEntitlement(license(service), "org-1", ObjectStorageType.Default)).entitlement).toBe(
      expected
    );
  });

  test("retention comes from the plan", async () => {
    const { plan } = await getSessionLogEntitlement(license({ plan: paid }), "org-1", ObjectStorageType.Default);
    expect(getSessionLogRetentionDays(plan)).toBe(365);
  });

  test("retention is 30 days when the plan doesn't say", () => {
    expect(getSessionLogRetentionDays({ agentVaultSessionLogRetentionDays: null })).toBe(30);
    expect(getSessionLogRetentionDays(null)).toBe(30);
  });
});
