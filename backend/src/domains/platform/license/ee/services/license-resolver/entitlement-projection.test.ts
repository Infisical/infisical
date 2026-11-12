import { describe, expect, test } from "vitest";

import { TInstanceFeatures } from "../../../ce/model/instance-entitlements";
import { entitlementsResponseSchema, TEntitlementsResponse } from "../../../ce/services/helpers/license-server-types";
import { projectV2ToFeatureSet, withCloudPlanDefaults } from "./entitlement-projection";
import { getDefaultOnPremFeatures } from "./license-fns";

const makeBase = (overrides: Partial<Record<keyof TInstanceFeatures, unknown>>): TInstanceFeatures =>
  ({ rateLimits: { readLimit: 0, writeLimit: 0, secretsLimit: 0 }, ...overrides }) as TInstanceFeatures;

const makeEntitlements = (features: TEntitlementsResponse["features"]): TEntitlementsResponse =>
  ({ features }) as TEntitlementsResponse;

describe("projectV2ToFeatureSet", () => {
  test("overlays a present v2 feature onto the base TInstanceFeatures field", () => {
    const plan = projectV2ToFeatureSet(makeBase({ rbac: false }), makeEntitlements({ rbac: { value: true } }));
    expect(plan.rbac).toBe(true);
  });

  test("keeps the base value when v2 omits the key", () => {
    const plan = projectV2ToFeatureSet(makeBase({ rbac: true }), makeEntitlements({}));
    expect(plan.rbac).toBe(true);
  });

  test("projects a nested rateLimits field via its dotted v1Field", () => {
    const plan = projectV2ToFeatureSet(makeBase({}), makeEntitlements({ read_rate_limit: { value: 500 } }));
    expect(plan.rateLimits.readLimit).toBe(500);
  });

  test("turns a feature on through a legacy registry key the current key leaves off", () => {
    const plan = projectV2ToFeatureSet(
      makeBase({ pamEnterpriseAlerting: false }),
      makeEntitlements({ pam_enterprise_alerting: { value: false }, pam_slack_notifications: { value: true } })
    );
    expect(plan.pamEnterpriseAlerting).toBe(true);
  });

  test("does not mutate the passed base", () => {
    const base = makeBase({ rbac: false });
    projectV2ToFeatureSet(base, makeEntitlements({ rbac: { value: true } }));
    expect(base.rbac).toBe(false);
  });
});

describe("projectV2ToFeatureSet notices", () => {
  const trialPaymentFailed = {
    type: "trial_payment_failed",
    product_key: "secrets_management",
    trial_plan_key: "enterprise",
    access_ends_at: "2026-11-04T10:00:00Z",
    next_attempt_at: "2026-10-08T10:00:00Z",
    cause: "payment_action_required"
  };

  const projectNotices = (notices: unknown[]) =>
    projectV2ToFeatureSet(makeBase({}), { features: {}, notices } as unknown as TEntitlementsResponse).notices;

  test("projects a trial_payment_failed notice into camelCase", () => {
    expect(projectNotices([trialPaymentFailed])).toEqual([
      {
        type: "trial_payment_failed",
        productKey: "secrets_management",
        trialPlanKey: "enterprise",
        accessEndsAt: "2026-11-04T10:00:00Z",
        nextAttemptAt: "2026-10-08T10:00:00Z",
        cause: "payment_action_required"
      }
    ]);
  });

  test("keeps a null next_attempt_at and absent optional fields as null", () => {
    const { type, product_key: productKey, access_ends_at: accessEndsAt } = trialPaymentFailed;
    const minimalNotice = { type, product_key: productKey, access_ends_at: accessEndsAt, next_attempt_at: null };
    expect(projectNotices([minimalNotice])).toEqual([
      expect.objectContaining({ trialPlanKey: null, nextAttemptAt: null, cause: null })
    ]);
  });

  test("drops unknown and malformed notices without failing the rest", () => {
    const notices = projectNotices([
      { type: "usage_over_limit", product_key: "pam" },
      { ...trialPaymentFailed, access_ends_at: "not-a-date" },
      trialPaymentFailed
    ]);
    expect(notices).toHaveLength(1);
  });

  test("a non-array notices payload parses as no notices", () => {
    const parsed = entitlementsResponseSchema.parse({ features: {}, notices: "oops" });
    expect(parsed.notices).toEqual([]);
  });
});

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
