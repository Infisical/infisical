import { describe, expect, test } from "vitest";

import { projectV2ToFeatureSet } from "@app/services/license-client/entitlement-projection";
import { TEntitlementsResponse } from "@app/services/license-client/license-client-types";

import { withCloudPlanDefaults } from "./cloud-plan-defaults";
import { getDefaultOnPremFeatures } from "./license-fns";

const entitlements = (features: TEntitlementsResponse["features"]) =>
  ({ slug: null, features, products: [] }) as unknown as TEntitlementsResponse;

const cloudPlan = (features: TEntitlementsResponse["features"]) => {
  const ent = entitlements(features);
  return withCloudPlanDefaults(projectV2ToFeatureSet(getDefaultOnPremFeatures(), ent), ent);
};

describe("cloud plan defaults for session log default storage", () => {
  test("is on when the License Server doesn't send the key", () => {
    expect(cloudPlan({}).agentVaultManagedStorage).toBe(true);
  });

  test("is on when the License Server sends its default, even an off one", () => {
    const plan = cloudPlan({ agent_vault_managed_storage: { value: false, source: "default" } });
    expect(plan.agentVaultManagedStorage).toBe(true);
  });

  test("is off when the org's plan turns it off", () => {
    const plan = cloudPlan({ agent_vault_managed_storage: { value: false, source: "plan" } });
    expect(plan.agentVaultManagedStorage).toBe(false);
  });

  test("is off when an override turns it off", () => {
    const plan = cloudPlan({ agent_vault_managed_storage: { value: false, source: "override" } });
    expect(plan.agentVaultManagedStorage).toBe(false);
  });

  test("is on when the License Server doesn't say where the value came from", () => {
    expect(cloudPlan({ agent_vault_managed_storage: { value: false } }).agentVaultManagedStorage).toBe(true);
  });

  test("is on in the stand-in plan used while the License Server can't be reached", () => {
    expect(withCloudPlanDefaults(getDefaultOnPremFeatures(), null).agentVaultManagedStorage).toBe(true);
  });
});
