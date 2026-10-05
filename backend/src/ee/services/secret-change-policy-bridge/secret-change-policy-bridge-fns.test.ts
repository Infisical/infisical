import { describe, expect, test } from "vitest";

import { EnforcementLevel } from "@app/lib/types";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";
import { TSecretChangePolicyRow } from "./secret-change-policy-bridge-dal";
import { readSecretChangePolicyConstraints, toSecretChangePolicy } from "./secret-change-policy-bridge-fns";

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
