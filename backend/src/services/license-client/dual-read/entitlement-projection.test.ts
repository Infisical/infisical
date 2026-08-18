import { describe, expect, test } from "vitest";

import { TFeatureSet } from "@app/ee/services/license/license-types";

import { TEntitlementsResponse } from "../license-client-types";
import { projectV2ToFeatureSet } from "./entitlement-projection";

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
