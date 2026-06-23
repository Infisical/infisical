import { describe, expect, test } from "vitest";

import { TFeatureSet } from "@app/ee/services/license/license-types";

import { TEntitlementsResponse } from "../license-client-types";
import { DualReadDiffKind, TFeatureMapping, UNLIMITED, unlimitedWhenNull } from "./dual-read-types";
import { compareEntitlements } from "./entitlement-comparator";

// TFeatureSet fields are literal-typed (e.g. auditLogsRetentionDays: 0), so fixtures use loose values.
const makePlan = (overrides: Partial<Record<keyof TFeatureSet, unknown>>): TFeatureSet =>
  ({ ...overrides }) as TFeatureSet;

const makeEntitlements = (features: TEntitlementsResponse["features"]): TEntitlementsResponse =>
  ({ features }) as TEntitlementsResponse;

const findByKey = (result: ReturnType<typeof compareEntitlements>, v2Key: string): (typeof result)[number] => {
  const match = result.find((d) => d.v2Key === v2Key);
  if (!match) {
    throw new Error(`expected a discrepancy for [v2Key=${v2Key}]`);
  }
  return match;
};

describe("compareEntitlements", () => {
  test("boolean values that agree report a Match", () => {
    const mappings: TFeatureMapping[] = [
      { v2Key: "sso_enforcement", v1Field: "enforceGoogleSSO", extractV1: (p) => p.enforceGoogleSSO }
    ];
    const plan = makePlan({ enforceGoogleSSO: false });
    const entitlements = makeEntitlements({ sso_enforcement: { value: false } });

    const result = compareEntitlements(plan, entitlements, mappings);
    const diff = findByKey(result, "sso_enforcement");
    expect(diff.kind).toBe(DualReadDiffKind.Match);
    expect(diff.v1Value).toBe(false);
    expect(diff.v2Value).toBe(false);
  });

  test("boolean values that disagree report a Mismatch", () => {
    const mappings: TFeatureMapping[] = [
      { v2Key: "sso_enforcement", v1Field: "enforceGoogleSSO", extractV1: (p) => p.enforceGoogleSSO }
    ];
    const plan = makePlan({ enforceGoogleSSO: false });
    const entitlements = makeEntitlements({ sso_enforcement: { value: true } });

    const diff = findByKey(compareEntitlements(plan, entitlements, mappings), "sso_enforcement");
    expect(diff.kind).toBe(DualReadDiffKind.Mismatch);
    expect(diff.v1Value).toBe(false);
    expect(diff.v2Value).toBe(true);
  });

  test("v1 null cap normalized to UNLIMITED matches a v2 unlimited representation", () => {
    const mappings: TFeatureMapping[] = [
      {
        v2Key: "max_identities",
        v1Field: "identityLimit",
        extractV1: (p) => p.identityLimit,
        normalize: unlimitedWhenNull
      }
    ];
    const plan = makePlan({ identityLimit: null });
    const entitlements = makeEntitlements({ max_identities: { value: UNLIMITED } });

    const diff = findByKey(compareEntitlements(plan, entitlements, mappings), "max_identities");
    expect(diff.kind).toBe(DualReadDiffKind.Match);
    expect(diff.v1Value).toBe(UNLIMITED);
    expect(diff.v2Value).toBe(UNLIMITED);
  });

  test("a v2 key that is absent reports V2Missing", () => {
    const mappings: TFeatureMapping[] = [
      {
        v2Key: "audit_retention_days",
        v1Field: "auditLogsRetentionDays",
        extractV1: (p) => p.auditLogsRetentionDays
      }
    ];
    const plan = makePlan({ auditLogsRetentionDays: 30 });
    const entitlements = makeEntitlements({});

    const diff = findByKey(compareEntitlements(plan, entitlements, mappings), "audit_retention_days");
    expect(diff.kind).toBe(DualReadDiffKind.V2Missing);
    expect(diff.v1Value).toBe(30);
    expect(diff.v2Value).toBeNull();
  });

  test("a mapping with no v1 extractor reports V1Absent", () => {
    const mappings: TFeatureMapping[] = [{ v2Key: "max_internal_cas", v1Field: null, extractV1: null }];
    const plan = makePlan({});
    const entitlements = makeEntitlements({ max_internal_cas: { value: 5 } });

    const diff = findByKey(compareEntitlements(plan, entitlements, mappings), "max_internal_cas");
    expect(diff.kind).toBe(DualReadDiffKind.V1Absent);
    expect(diff.v1Value).toBeNull();
    expect(diff.v2Value).toBe(5);
  });

  test("v1 UNLIMITED versus a v2 finite number downgrades to Indeterminate", () => {
    const mappings: TFeatureMapping[] = [
      {
        v2Key: "max_identities",
        v1Field: "identityLimit",
        extractV1: (p) => p.identityLimit,
        normalize: unlimitedWhenNull
      }
    ];
    const plan = makePlan({ identityLimit: null });
    const entitlements = makeEntitlements({ max_identities: { value: 100 } });

    const diff = findByKey(compareEntitlements(plan, entitlements, mappings), "max_identities");
    expect(diff.kind).toBe(DualReadDiffKind.Indeterminate);
    expect(diff.v1Value).toBe(UNLIMITED);
    expect(diff.v2Value).toBe(100);
  });

  test("a v2 value present but null reports V2Missing, not a false Mismatch, for a non-normalized feature", () => {
    const mappings: TFeatureMapping[] = [{ v2Key: "rbac", v1Field: "rbac", extractV1: (p) => p.rbac }];
    const plan = makePlan({ rbac: false });
    const entitlements = makeEntitlements({ rbac: { value: null } });

    const diff = findByKey(compareEntitlements(plan, entitlements, mappings), "rbac");
    expect(diff.kind).toBe(DualReadDiffKind.V2Missing);
    expect(diff.v1Value).toBe(false);
    expect(diff.v2Value).toBeNull();
  });

  test("a v2 null normalized via unlimitedWhenNull matches a v1 unlimited cap", () => {
    const mappings: TFeatureMapping[] = [
      {
        v2Key: "workspace_limit",
        v1Field: "workspaceLimit",
        extractV1: (p) => p.workspaceLimit,
        normalize: unlimitedWhenNull
      }
    ];
    const plan = makePlan({ workspaceLimit: null });
    const entitlements = makeEntitlements({ workspace_limit: { value: null } });

    const diff = findByKey(compareEntitlements(plan, entitlements, mappings), "workspace_limit");
    expect(diff.kind).toBe(DualReadDiffKind.Match);
    expect(diff.v1Value).toBe(UNLIMITED);
    expect(diff.v2Value).toBe(UNLIMITED);
  });
});
