import { describe, expect, test } from "vitest";

import { TFeatureSet } from "@app/ee/services/license/license-types";

import { TEntitlementsResponse } from "../license-client-types";
import { classifyUnlicensedCompare } from "./unlicensed";

const makePlan = (slug: string | null): TFeatureSet => ({ slug }) as TFeatureSet;
const makeEntitlements = (features: TEntitlementsResponse["features"]): TEntitlementsResponse =>
  ({ features }) as TEntitlementsResponse;

describe("classifyUnlicensedCompare", () => {
  const cases: {
    name: string;
    features: TEntitlementsResponse["features"];
    slug: string | null;
    wantSkip: boolean;
    wantWarn: boolean;
  }[] = [
    { name: "empty features + paid v1 skips and warns", features: {}, slug: "pro", wantSkip: true, wantWarn: true },
    {
      name: "empty features + free v1 skips without warning",
      features: {},
      slug: "starter",
      wantSkip: true,
      wantWarn: false
    },
    {
      name: "empty features + null slug skips without warning",
      features: {},
      slug: null,
      wantSkip: true,
      wantWarn: false
    },
    {
      name: "all-default features + paid v1 skips and warns",
      features: {
        environment_limit: { value: 3, source: "default" },
        max_identities: { value: 5, source: "default" }
      },
      slug: "enterprise",
      wantSkip: true,
      wantWarn: true
    },
    {
      name: "mixed sources runs the compare",
      features: {
        environment_limit: { value: 3, source: "default" },
        sso_enforcement: { value: true, source: "plan" }
      },
      slug: "pro",
      wantSkip: false,
      wantWarn: false
    },
    {
      name: "licensed features run the compare",
      features: { sso_enforcement: { value: true, source: "plan" } },
      slug: "enterprise",
      wantSkip: false,
      wantWarn: false
    }
  ];

  for (const tc of cases) {
    test(tc.name, () => {
      const result = classifyUnlicensedCompare(makeEntitlements(tc.features), makePlan(tc.slug));
      expect(result.skip).toBe(tc.wantSkip);
      expect(result.warnPaid).toBe(tc.wantWarn);
    });
  }
});
