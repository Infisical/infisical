import { createMongoAbility } from "@casl/ability";
import { describe, expect, it, vi } from "vitest";

import { TFeatureSet } from "@app/ee/services/license/license-types";
import { EnforcementLevel } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

import { accessApprovalPolicyServiceFactory } from "./access-approval-policy-service";
import { ApproverType } from "./access-approval-policy-types";

const ORG_ID = "org-id";
const PROJECT_ID = "project-id";
const POLICY_ID = "policy-id";

const actor = {
  actor: ActorType.USER as const,
  actorId: "actor-id",
  actorAuthMethod: null,
  actorOrgId: ORG_ID
};

const createService = (secretApproval: boolean) => {
  const getPlan = vi.fn().mockResolvedValue({ secretApproval } as unknown as TFeatureSet);

  const deps = {
    projectDAL: {
      findProjectBySlug: vi.fn().mockResolvedValue({ id: PROJECT_ID, orgId: ORG_ID })
    },
    permissionService: {
      // the gate sits behind the authorization check, so the ability must allow the action
      getProjectPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility([{ action: "manage", subject: "all" }])
      })
    },
    licenseService: { getPlan },
    accessApprovalPolicyDAL: {
      findById: vi.fn().mockResolvedValue({
        id: POLICY_ID,
        projectId: PROJECT_ID,
        secretPath: "/",
        // zero approvals keeps the "approvals cannot be greater than approvers" check
        // from firing ahead of the gate with an empty approver list
        approvals: 0,
        environments: []
      })
    },
    projectEnvDAL: { find: vi.fn(), findOne: vi.fn() }
  };

  const service = accessApprovalPolicyServiceFactory(
    deps as unknown as Parameters<typeof accessApprovalPolicyServiceFactory>[0]
  );

  return { service, getPlan };
};

describe("access approval policy plan gate", () => {
  it("rejects policy creation without the secretApproval entitlement", async () => {
    const { service, getPlan } = createService(false);

    await expect(
      service.createAccessApprovalPolicy({
        ...actor,
        projectSlug: "project-slug",
        name: "policy",
        secretPath: "/",
        environment: "dev",
        approvals: 1,
        approvers: [{ type: ApproverType.User, id: "approver-id" }],
        enforcementLevel: EnforcementLevel.Hard,
        allowedSelfApprovals: true
      })
    ).rejects.toThrow("Upgrade plan to create access approval policy");

    expect(getPlan).toHaveBeenCalledWith(ORG_ID);
  });

  it("rejects policy updates without the secretApproval entitlement", async () => {
    const { service, getPlan } = createService(false);

    await expect(
      service.updateAccessApprovalPolicy({
        ...actor,
        policyId: POLICY_ID,
        approvers: [],
        allowedSelfApprovals: true
      })
    ).rejects.toThrow("Upgrade plan to update access approval policy");

    expect(getPlan).toHaveBeenCalledWith(ORG_ID);
  });
});
