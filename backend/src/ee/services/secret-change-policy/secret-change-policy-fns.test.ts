import { describe, expect, test } from "vitest";

import { EnforcementLevel } from "@app/lib/types";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { ActorType } from "@app/services/auth/auth-type";

import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";
import { TSecretChangePolicyRow } from "./secret-change-policy-dal";
import {
  getPolicyScore,
  readSecretChangePolicyConstraints,
  resolvePolicyForPath,
  shouldApplyPolicy,
  toSecretChangePolicy
} from "./secret-change-policy-fns";

const ENV_DEV = { id: "env-dev", name: "Development", slug: "dev" };
const ENV_PROD = { id: "env-prod", name: "Production", slug: "prod" };

const buildRow = (overrides: Partial<TSecretChangePolicyRow> = {}): TSecretChangePolicyRow => ({
  id: "policy-1",
  projectId: "project-1",
  organizationId: "org-1",
  type: ApprovalPolicyType.SecretChange,
  name: "dev-policy",
  isActive: true,
  maxRequestTtl: null,
  conditions: { version: 1, conditions: [] },
  constraints: { version: 1, constraints: { allowedSelfApprovals: false } },
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
  bypassForMachineIdentities: true,
  enforcementLevel: EnforcementLevel.Soft,
  scopeType: null,
  scopeId: null,
  secretPath: "/app",
  environments: [ENV_DEV, ENV_PROD],
  steps: [{ id: "step-1", stepNumber: 1, requiredApprovals: 2 }],
  approvers: [
    { type: ApproverType.User, id: "user-1", username: "alice@example.com" },
    { type: ApproverType.Group, id: "group-1" }
  ],
  bypassers: [{ type: BypasserType.User, id: "user-2", username: "bob@example.com" }],
  userApprovers: [{ userId: "user-1" }, { userId: "user-3" }],
  ...overrides
});

describe("readSecretChangePolicyConstraints", () => {
  test("reads allowedSelfApprovals from the stored constraints blob", () => {
    expect(readSecretChangePolicyConstraints({ version: 1, constraints: { allowedSelfApprovals: false } })).toEqual({
      allowedSelfApprovals: false
    });
  });

  test("returns nothing for a blob it cannot read", () => {
    expect(readSecretChangePolicyConstraints(null)).toEqual({});
    expect(readSecretChangePolicyConstraints({ version: 1, constraints: { allowedSelfApprovals: "yes" } })).toEqual({});
  });
});

describe("toSecretChangePolicy", () => {
  test("flattens a global approval system row into the legacy secret approval policy shape", () => {
    const row = buildRow();

    expect(toSecretChangePolicy(row)).toEqual({
      id: "policy-1",
      name: "dev-policy",
      projectId: "project-1",
      enforcementLevel: EnforcementLevel.Soft,
      bypassForMachineIdentities: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      deletedAt: null,
      secretPath: "/app",
      approvals: 2,
      allowedSelfApprovals: false,
      envId: ENV_DEV.id,
      environment: ENV_DEV,
      environments: [ENV_DEV, ENV_PROD],
      approvers: row.approvers,
      bypassers: row.bypassers,
      userApprovers: row.userApprovers
    });
  });

  test("takes the approval count from the first step and defaults to one without a step", () => {
    expect(
      toSecretChangePolicy(
        buildRow({
          steps: [
            { id: "step-1", stepNumber: 1, requiredApprovals: 3 },
            { id: "step-2", stepNumber: 2, requiredApprovals: 1 }
          ]
        })
      ).approvals
    ).toBe(3);
    expect(toSecretChangePolicy(buildRow({ steps: [] })).approvals).toBe(1);
  });

  test("defaults allowedSelfApprovals to true when the constraints blob is unreadable", () => {
    expect(toSecretChangePolicy(buildRow({ constraints: "corrupt" })).allowedSelfApprovals).toBe(true);
    expect(toSecretChangePolicy(buildRow({ constraints: { version: 1, constraints: {} } })).allowedSelfApprovals).toBe(
      true
    );
  });

  test("treats a missing machine identity bypass flag as disabled", () => {
    expect(toSecretChangePolicy(buildRow({ bypassForMachineIdentities: null })).bypassForMachineIdentities).toBe(false);
  });
});

const makePolicy = (bypassForMachineIdentities = false) => ({ bypassForMachineIdentities });

const makePathPolicy = (id: string, secretPath: string | null, createdAt = "2026-01-01") => ({
  id,
  secretPath,
  createdAt: new Date(createdAt)
});

describe("getPolicyScore", () => {
  test("ranks an exact path above a glob above an environment-wide policy", () => {
    expect(getPolicyScore({ secretPath: "/app/svc" })).toBe(2);
    expect(getPolicyScore({ secretPath: "/app/**" })).toBe(1);
    expect(getPolicyScore({ secretPath: null })).toBe(0);
    expect(getPolicyScore({})).toBe(0);
  });
});

describe("resolvePolicyForPath", () => {
  test("picks the exact path over a glob over an environment-wide policy", () => {
    const envWide = makePathPolicy("env", null);
    const glob = makePathPolicy("glob", "/app/**");
    const exact = makePathPolicy("exact", "/app/svc");

    expect(resolvePolicyForPath([envWide, glob, exact], "/app/svc")).toBe(exact);
    expect(resolvePolicyForPath([envWide, glob, exact], "/app/other")).toBe(glob);
    expect(resolvePolicyForPath([envWide, glob, exact], "/elsewhere")).toBe(envWide);
  });

  test("ignores policies whose path does not match", () => {
    expect(resolvePolicyForPath([makePathPolicy("a", "/app/**")], "/db")).toBeUndefined();
    expect(resolvePolicyForPath([], "/db")).toBeUndefined();
  });

  test("breaks a tie on the earliest creation regardless of input order", () => {
    const newer = makePathPolicy("newer", "/app/**", "2026-02-01");
    const older = makePathPolicy("older", "/app/*", "2026-01-01");

    expect(resolvePolicyForPath([newer, older], "/app/svc")).toBe(older);
    expect(resolvePolicyForPath([older, newer], "/app/svc")).toBe(older);
  });

  test("falls back to the id when creation times are equal", () => {
    const b = makePathPolicy("b", "/app/**");
    const a = makePathPolicy("a", "/app/*");

    expect(resolvePolicyForPath([b, a], "/app/svc")).toBe(a);
  });
});

describe("shouldApplyPolicy", () => {
  test("returns false when policy is undefined", () => {
    expect(shouldApplyPolicy(undefined, ActorType.USER)).toBe(false);
  });

  test("returns true for USER actor with bypass disabled", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.USER)).toBe(true);
  });

  test("returns true for USER actor with bypass enabled (bypass only affects identities)", () => {
    expect(shouldApplyPolicy(makePolicy(true), ActorType.USER)).toBe(true);
  });

  test("returns true for IDENTITY actor with bypass disabled", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.IDENTITY)).toBe(true);
  });

  test("returns false for IDENTITY actor with bypass enabled", () => {
    expect(shouldApplyPolicy(makePolicy(true), ActorType.IDENTITY)).toBe(false);
  });

  test("returns false for SERVICE actor", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.SERVICE)).toBe(false);
  });

  test("returns false for PLATFORM actor", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.PLATFORM)).toBe(false);
  });

  test("returns false for SCIM_CLIENT actor", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.SCIM_CLIENT)).toBe(false);
  });

  test("returns false for GATEWAY actor", () => {
    expect(shouldApplyPolicy(makePolicy(false), ActorType.GATEWAY)).toBe(false);
  });
});
