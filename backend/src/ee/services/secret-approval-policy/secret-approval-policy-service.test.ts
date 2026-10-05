import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { conditionsMatcher } from "@app/lib/casl";
import { EnforcementLevel } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

import { ApproverType } from "../access-approval-policy/access-approval-policy-types";
import { ProjectPermissionActions, ProjectPermissionSet, ProjectPermissionSub } from "../permission/project-permission";
import { secretApprovalPolicyServiceFactory } from "./secret-approval-policy-service";

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const ENV_DEV = { id: "env-dev", name: "Development", slug: "dev", projectId: PROJECT_ID };

const allowCreate = createMongoAbility<ProjectPermissionSet>(
  [{ action: ProjectPermissionActions.Create, subject: ProjectPermissionSub.SecretApproval }],
  { conditionsMatcher }
);

// Only the collaborators the duplicate-policy check reaches; anything else crashes the test if touched.
const buildService = ({ bridgePolicy }: { bridgePolicy?: { id: string; environments: { id: string }[] } }) => {
  const deps = {
    permissionService: { getProjectPermission: vi.fn().mockResolvedValue({ permission: allowCreate }) },
    licenseService: { getPlan: vi.fn().mockResolvedValue({ secretApproval: true }) },
    projectEnvDAL: { find: vi.fn().mockResolvedValue([ENV_DEV]) },
    secretApprovalPolicyDAL: { findPolicyByEnvIdAndSecretPath: vi.fn().mockResolvedValue(undefined) },
    secretChangePolicyBridgeService: {
      findSecretChangePolicyBySecretPath: vi.fn().mockResolvedValue(bridgePolicy)
    }
  };

  const service = secretApprovalPolicyServiceFactory(
    deps as unknown as Parameters<typeof secretApprovalPolicyServiceFactory>[0]
  );
  return { service, deps };
};

describe("secretApprovalPolicyService createSecretApprovalPolicy", () => {
  test("rejects a path and environment already governed by a policy created through the bridge", async () => {
    const { service, deps } = buildService({
      bridgePolicy: { id: "bridge-policy-1", environments: [{ id: ENV_DEV.id }] }
    });

    await expect(
      service.createSecretApprovalPolicy({
        actor: ActorType.USER,
        actorId: "actor-1",
        actorOrgId: ORG_ID,
        actorAuthMethod: null,
        projectId: PROJECT_ID,
        name: "dev-policy",
        approvals: 1,
        approvers: [{ type: ApproverType.User, id: "user-1" }],
        secretPath: "/",
        environment: ENV_DEV.slug,
        enforcementLevel: EnforcementLevel.Hard,
        allowedSelfApprovals: true,
        bypassForMachineIdentities: false
      } as unknown as Parameters<typeof service.createSecretApprovalPolicy>[0])
    ).rejects.toThrow("A policy for secret path '/' already exists in environment 'dev'");

    expect(deps.secretApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath).toHaveBeenCalledWith({
      envIds: [ENV_DEV.id],
      secretPath: "/"
    });
    expect(deps.secretChangePolicyBridgeService.findSecretChangePolicyBySecretPath).toHaveBeenCalledWith({
      envIds: [ENV_DEV.id],
      secretPath: "/"
    });
  });
});
