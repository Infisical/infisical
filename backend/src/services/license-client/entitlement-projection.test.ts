import { describe, expect, test } from "vitest";

import { TFeatureSet } from "@app/ee/services/license/license-types";

import { projectV2ToFeatureSet } from "./entitlement-projection";
import { entitlementsResponseSchema, TEntitlementsResponse } from "./license-client-types";

const makeBase = (overrides: Partial<Record<keyof TFeatureSet, unknown>>): TFeatureSet =>
  ({ rateLimits: { readLimit: 0, writeLimit: 0, secretsLimit: 0 }, ...overrides }) as TFeatureSet;

const makeEntitlements = (features: TEntitlementsResponse["features"]): TEntitlementsResponse =>
  ({ features }) as TEntitlementsResponse;

describe("projectV2ToFeatureSet", () => {
  test("overlays a present v2 feature onto the base TFeatureSet field", () => {
    const plan = projectV2ToFeatureSet(makeBase({ rbac: false }), makeEntitlements({ rbac: { value: true } }));
    expect(plan.rbac).toBe(true);
  });

  test("keeps the base value when v2 omits the key", () => {
    const plan = projectV2ToFeatureSet(makeBase({ rbac: true }), makeEntitlements({}));
    expect(plan.rbac).toBe(true);
  });

  test("keeps the base value when v2 returns null", () => {
    const plan = projectV2ToFeatureSet(
      makeBase({ dynamicSecret: true }),
      makeEntitlements({ dynamic_secret: { value: null } })
    );
    expect(plan.dynamicSecret).toBe(true);
  });

  test("projects a nested rateLimits field via its dotted v1Field", () => {
    const plan = projectV2ToFeatureSet(makeBase({}), makeEntitlements({ read_rate_limit: { value: 500 } }));
    expect(plan.rateLimits.readLimit).toBe(500);
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
