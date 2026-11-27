import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { BadRequestError } from "@app/lib/errors";

import { getResourceLimits, ResourceLimit } from ".";

const config = { INFISICAL_CLOUD: true };

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

const ORG_ID = "org-1";

const licenseWithWebhookCap = (cap: number | null | undefined) =>
  new FakeLicenseService().setPlan(ORG_ID, { smWebhooksPerProjectLimit: cap });

describe("resource limits", () => {
  beforeEach(() => {
    config.INFISICAL_CLOUD = true;
  });

  test("caps come from the org's plan on Infisical Cloud", async () => {
    const limits = await getResourceLimits(licenseWithWebhookCap(100), ORG_ID);
    expect(limits.max(ResourceLimit.WebhooksPerProject)).toBe(100);
  });

  test("a null cap on the plan leaves the org uncapped", async () => {
    const limits = await getResourceLimits(licenseWithWebhookCap(null), ORG_ID);
    expect(limits.max(ResourceLimit.WebhooksPerProject)).toBeNull();
    expect(() =>
      limits.assertWithin({ limit: ResourceLimit.WebhooksPerProject, used: 1_000_000, describe: () => "over" })
    ).not.toThrow();
  });

  test("a plan without the cap leaves the org uncapped", async () => {
    const limits = await getResourceLimits(licenseWithWebhookCap(undefined), ORG_ID);
    expect(limits.max(ResourceLimit.WebhooksPerProject)).toBeNull();
  });

  test("self-hosted instances are never capped and never read the plan", async () => {
    config.INFISICAL_CLOUD = false;
    const licenseService = licenseWithWebhookCap(1);
    const getPlan = vi.spyOn(licenseService, "getPlan");

    const limits = await getResourceLimits(licenseService, ORG_ID);
    expect(limits.max(ResourceLimit.WebhooksPerProject)).toBeNull();
    expect(() =>
      limits.assertWithin({ limit: ResourceLimit.WebhooksPerProject, used: 1_000_000, describe: () => "over" })
    ).not.toThrow();
    expect(getPlan).not.toHaveBeenCalled();
  });

  test("allows reaching the cap and refuses going past it", async () => {
    const limits = await getResourceLimits(licenseWithWebhookCap(100), ORG_ID);
    const check = (used: number, adding?: number) => () =>
      limits.assertWithin({
        limit: ResourceLimit.WebhooksPerProject,
        used,
        adding,
        describe: (max) => `at most ${max}`
      });

    expect(check(99)).not.toThrow();
    expect(check(100)).toThrow(BadRequestError);
    expect(check(100)).toThrow("at most 100");
    expect(check(95, 5)).not.toThrow();
    expect(check(95, 6)).toThrow(BadRequestError);
  });
});
