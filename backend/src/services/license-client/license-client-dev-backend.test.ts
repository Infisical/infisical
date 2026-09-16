import { describe, expect, test } from "vitest";

import { licenseServerDevBackend } from "./license-client-dev-backend";

describe("licenseServerDevBackend", () => {
  test("offers an eligible cloud trial without granting the feature", async () => {
    const backend = licenseServerDevBackend("cloud-trial-available");

    const entitlements = await backend.fetchEntitlements({ id: "org-id" });
    const catalog = await backend.fetchCatalog("org-id");

    expect(entitlements.features.dynamic_secret.value).toBe(false);
    expect(entitlements.products).toEqual([]);
    expect(catalog.products[0].plans[0]).toMatchObject({
      selfServe: true,
      trialable: true,
      trialDays: 14
    });
  });

  test("marks the feature and product as trialing after starting a trial", async () => {
    const backend = licenseServerDevBackend("cloud-trial-available");

    await expect(
      backend.startTrial("org-id", { productKey: "secrets_management", planKey: "advanced" })
    ).resolves.toEqual({ outcome: "trial_started" });

    const entitlements = await backend.fetchEntitlements({ id: "org-id" });
    const subscription = await backend.fetchSubscription("org-id");

    expect(entitlements.features.dynamic_secret).toMatchObject({
      value: true,
      source: "trial",
      from_product: "secrets_management"
    });
    expect(entitlements.products[0]).toMatchObject({
      product_key: "secrets_management",
      status: "trialing"
    });
    expect(subscription?.items[0]).toMatchObject({
      productId: "secrets_management",
      isTrialing: true
    });
  });

  test("represents a used trial as upgradeable but not trialable", async () => {
    const backend = licenseServerDevBackend("cloud-trial-used");

    const catalog = await backend.fetchCatalog("org-id");
    const trials = await backend.fetchTrials("org-id");

    expect(catalog.products[0].plans[0]).toMatchObject({ trialable: false, upgradeable: true });
    expect(trials.trials[0]).toMatchObject({
      product_key: "secrets_management",
      outcome: "completed"
    });
  });

  test("represents managed cloud billing as sales-led and not self-serve", async () => {
    const backend = licenseServerDevBackend("cloud-managed");

    const catalog = await backend.fetchCatalog("org-id");
    const subscription = await backend.fetchSubscription("org-id");

    expect(catalog.products[0].plans[0]).toMatchObject({ selfServe: false, salesLed: true });
    expect(subscription?.capabilities).toEqual({ checkoutFrozen: false, selfServe: false });
  });

  test("represents a licensed self-hosted instance with active entitlements", async () => {
    const backend = licenseServerDevBackend("self-hosted-licensed");

    const entitlements = await backend.fetchEntitlements({ id: "self-hosted" });
    const subscription = await backend.fetchSubscription("self-hosted");

    expect(entitlements.features.dynamic_secret.value).toBe(true);
    expect(entitlements.products[0]).toMatchObject({
      product_key: "secrets_management",
      status: "active"
    });
    expect(subscription?.capabilities?.selfServe).toBe(false);
  });
});
