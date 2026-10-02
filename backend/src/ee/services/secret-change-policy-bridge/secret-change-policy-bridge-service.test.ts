import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { conditionsMatcher } from "@app/lib/casl";
import { NotFoundError } from "@app/lib/errors";
import { EnforcementLevel } from "@app/lib/types";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { ActorType } from "@app/services/auth/auth-type";

import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";
import { ProjectPermissionActions, ProjectPermissionSet, ProjectPermissionSub } from "../permission/project-permission";
import { secretChangePolicyBridgeServiceFactory } from "./secret-change-policy-bridge-service";

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const ENV_DEV = { id: "env-dev", name: "Development", slug: "dev", projectId: PROJECT_ID };
const ENV_PROD = { id: "env-prod", name: "Production", slug: "prod", projectId: PROJECT_ID };
const TX = { isTx: true };

const allowCreate = createMongoAbility<ProjectPermissionSet>(
  [{ action: ProjectPermissionActions.Create, subject: ProjectPermissionSub.SecretApproval }],
  { conditionsMatcher }
);
const denyAll = createMongoAbility<ProjectPermissionSet>([], { conditionsMatcher });

const ctx = {
  actor: ActorType.USER,
  actorId: "actor-1",
  actorOrgId: ORG_ID,
  actorAuthMethod: null
} as unknown as Pick<
  Parameters<ReturnType<typeof secretChangePolicyBridgeServiceFactory>["createSecretChangePolicy"]>[0],
  "actor" | "actorId" | "actorOrgId" | "actorAuthMethod"
>;

type TMembership = { effectiveUserIds: string[]; effectiveGroupIds: string[] };
type TExistingPolicy = { id: string; environments: { id: string }[] };

// Only the collaborators createSecretChangePolicy touches; everything else is left undefined so an
// unexpected reach shows up as a crash rather than a silent pass.
const buildService = ({
  permission = allowCreate,
  plan = { secretApproval: true },
  envs = [ENV_DEV, ENV_PROD],
  users = [] as { id: string; username: string }[],
  existingPolicy = undefined as TExistingPolicy | undefined,
  existingLegacyPolicy = undefined as TExistingPolicy | undefined,
  memberships = [{ effectiveUserIds: ["user-1"], effectiveGroupIds: [] }] as TMembership[]
} = {}) => {
  const findEffectiveProjectSubjectsMembership = vi.fn();
  memberships.forEach((membership) => findEffectiveProjectSubjectsMembership.mockResolvedValueOnce(membership));

  const deps = {
    approvalPolicyDAL: {
      findOne: vi.fn().mockResolvedValue(undefined),
      create: vi.fn((row: Record<string, unknown>) =>
        Promise.resolve({
          id: "policy-1",
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
          ...row
        })
      ),
      transaction: vi.fn((cb: (tx: unknown) => unknown) => Promise.resolve(cb(TX)))
    },
    approvalPolicyStepsDAL: {
      create: vi.fn((row: Record<string, unknown>) => Promise.resolve({ id: "step-1", ...row }))
    },
    approvalPolicyStepApproversDAL: { insertMany: vi.fn((rows: unknown[]) => Promise.resolve(rows)) },
    approvalPolicyBypassersDAL: { insertMany: vi.fn((rows: unknown[]) => Promise.resolve(rows)) },
    approvalPolicySecretEnvironmentDAL: {
      insertMany: vi.fn((rows: unknown[]) => Promise.resolve(rows)),
      findPolicyByEnvIdAndSecretPath: vi.fn().mockResolvedValue(existingPolicy)
    },
    secretApprovalPolicyDAL: { findPolicyByEnvIdAndSecretPath: vi.fn().mockResolvedValue(existingLegacyPolicy) },
    projectEnvDAL: {
      find: vi.fn(({ $in }: { $in: { slug: string[] } }) =>
        Promise.resolve(envs.filter((env) => $in.slug.includes(env.slug)))
      )
    },
    projectDAL: { findEffectiveProjectSubjectsMembership },
    userDAL: {
      find: vi.fn(({ $in }: { $in: { username: string[] } }) =>
        Promise.resolve(users.filter((user) => $in.username.includes(user.username)))
      )
    },
    permissionService: { getProjectPermission: vi.fn().mockResolvedValue({ permission }) },
    licenseService: { getPlan: vi.fn().mockResolvedValue(plan) }
  };

  const service = secretChangePolicyBridgeServiceFactory(
    deps as unknown as Parameters<typeof secretChangePolicyBridgeServiceFactory>[0]
  );
  return { service, deps };
};

type TService = ReturnType<typeof buildService>["service"];
type TCreateInput = Parameters<TService["createSecretChangePolicy"]>[0];

const create = (service: TService, overrides: Partial<TCreateInput> = {}) =>
  service.createSecretChangePolicy({
    ...ctx,
    projectId: PROJECT_ID,
    name: "dev-policy",
    approvals: 1,
    approvers: [{ type: ApproverType.User, id: "user-1" }],
    secretPath: "/",
    environment: "dev",
    enforcementLevel: EnforcementLevel.Hard,
    allowedSelfApprovals: true,
    bypassForMachineIdentities: false,
    ...overrides
  });

describe("secretChangePolicyBridge findSecretChangePolicy", () => {
  test("only matches policies of the secret-change type", async () => {
    const { service, deps } = buildService();

    await service.findSecretChangePolicy("policy-1", TX);

    expect(deps.approvalPolicyDAL.findOne).toHaveBeenCalledWith(
      { id: "policy-1", type: ApprovalPolicyType.SecretChange },
      TX
    );
  });
});

describe("secretChangePolicyBridge createSecretChangePolicy", () => {
  test("rejects approvals greater than the number of user approvers", async () => {
    const { service, deps } = buildService();

    await expect(create(service, { approvals: 2 })).rejects.toThrow("Approvals cannot be greater than approvers");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("skips the approvals count check when a group approver is present", async () => {
    const { service } = buildService({ memberships: [{ effectiveUserIds: [], effectiveGroupIds: ["g-1"] }] });

    await expect(
      create(service, { approvals: 5, approvers: [{ type: ApproverType.Group, id: "g-1" }] })
    ).resolves.toMatchObject({ approvals: 5 });
  });

  test("rejects an actor without create permission on secret approvals", async () => {
    const { service, deps } = buildService({ permission: denyAll });

    await expect(create(service)).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects when the plan does not include secret approvals", async () => {
    const { service, deps } = buildService({ plan: { secretApproval: false } });

    await expect(create(service)).rejects.toThrow("plan restriction");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects when no environment is provided", async () => {
    const { service } = buildService();

    await expect(create(service, { environment: undefined, environments: [] })).rejects.toThrow(
      "Must provide either environment or environments"
    );
  });

  test("rejects an environment slug that does not exist in the project", async () => {
    const { service } = buildService({ envs: [ENV_DEV] });

    const result = create(service, { environment: undefined, environments: ["dev", "prod"] });
    await expect(result).rejects.toBeInstanceOf(NotFoundError);
    await expect(result).rejects.toThrow("One or more environments not found: prod");
  });

  test("rejects a second policy on the same secret path and environment", async () => {
    const { service, deps } = buildService({
      existingPolicy: { id: "other-policy", environments: [{ id: ENV_DEV.id }] }
    });

    await expect(create(service)).rejects.toThrow("A policy for secret path '/' already exists in environment 'dev'");
    expect(deps.approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdAndSecretPath).toHaveBeenCalledWith({
      envIds: [ENV_DEV.id],
      secretPath: "/"
    });
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects a second policy when the legacy secret approval tables already govern the path", async () => {
    const { service, deps } = buildService({
      existingLegacyPolicy: { id: "legacy-policy", environments: [{ id: ENV_DEV.id }] }
    });

    await expect(create(service)).rejects.toThrow("A policy for secret path '/' already exists in environment 'dev'");
    expect(deps.secretApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath).toHaveBeenCalledWith({
      envIds: [ENV_DEV.id],
      secretPath: "/"
    });
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects a bypasser username that matches no user", async () => {
    const { service } = buildService();

    await expect(
      create(service, { bypassers: [{ type: BypasserType.User, username: "ghost@example.com" }] })
    ).rejects.toThrow("Invalid bypasser user: ghost@example.com");
  });

  test("rejects an approver username that matches no user", async () => {
    const { service } = buildService();

    await expect(
      create(service, { approvers: [{ type: ApproverType.User, username: "ghost@example.com" }] })
    ).rejects.toThrow("Invalid approver user: ghost@example.com");
  });

  test("rejects an approver who is not a project member", async () => {
    const { service, deps } = buildService({ memberships: [{ effectiveUserIds: [], effectiveGroupIds: [] }] });

    await expect(create(service)).rejects.toThrow("Some users are not members of the project: user-1");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects an approver group that is not a project member", async () => {
    const { service } = buildService({ memberships: [{ effectiveUserIds: [], effectiveGroupIds: [] }] });

    await expect(create(service, { approvers: [{ type: ApproverType.Group, id: "g-1" }] })).rejects.toThrow(
      "Some groups are not members of the project: g-1"
    );
  });

  test("rejects a bypasser who is not a project member", async () => {
    const { service, deps } = buildService({
      memberships: [
        { effectiveUserIds: ["user-1"], effectiveGroupIds: [] },
        { effectiveUserIds: [], effectiveGroupIds: [] }
      ]
    });

    await expect(create(service, { bypassers: [{ type: BypasserType.User, id: "u-3" }] })).rejects.toThrow(
      "Some users are not members of the project: u-3"
    );
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("writes the policy, one step, approvers, bypassers and environment rows in one transaction", async () => {
    const { service, deps } = buildService({
      users: [{ id: "user-2", username: "bob@example.com" }],
      memberships: [
        { effectiveUserIds: ["user-1", "user-2"], effectiveGroupIds: ["g-1"] },
        { effectiveUserIds: ["u-3"], effectiveGroupIds: [] },
        { effectiveUserIds: [], effectiveGroupIds: ["g-2"] }
      ]
    });

    await create(service, {
      environment: undefined,
      environments: ["dev", "prod"],
      approvers: [
        { type: ApproverType.User, id: "user-1" },
        { type: ApproverType.User, username: "bob@example.com" },
        { type: ApproverType.Group, id: "g-1" }
      ],
      bypassers: [
        { type: BypasserType.User, id: "u-3" },
        { type: BypasserType.Group, id: "g-2" }
      ]
    });

    expect(deps.approvalPolicyDAL.create).toHaveBeenCalledWith(
      {
        projectId: PROJECT_ID,
        organizationId: ORG_ID,
        type: ApprovalPolicyType.SecretChange,
        name: "dev-policy",
        enforcementLevel: EnforcementLevel.Hard,
        bypassForMachineIdentities: false,
        conditions: { version: 1, conditions: [] },
        constraints: { version: 1, constraints: { allowedSelfApprovals: true } },
        scopeType: null,
        scopeId: null
      },
      TX
    );
    expect(deps.approvalPolicyStepsDAL.create).toHaveBeenCalledWith(
      { policyId: "policy-1", stepNumber: 1, requiredApprovals: 1 },
      TX
    );
    expect(deps.approvalPolicyStepApproversDAL.insertMany).toHaveBeenCalledWith(
      [
        { policyStepId: "step-1", userId: "user-1", groupId: null },
        { policyStepId: "step-1", userId: "user-2", groupId: null },
        { policyStepId: "step-1", userId: null, groupId: "g-1" }
      ],
      TX
    );
    expect(deps.approvalPolicyBypassersDAL.insertMany).toHaveBeenCalledWith(
      [
        { policyId: "policy-1", userId: "u-3", groupId: null },
        { policyId: "policy-1", userId: null, groupId: "g-2" }
      ],
      TX
    );
    expect(deps.approvalPolicySecretEnvironmentDAL.insertMany).toHaveBeenCalledWith(
      [
        { policyId: "policy-1", envId: ENV_DEV.id, secretPath: "/" },
        { policyId: "policy-1", envId: ENV_PROD.id, secretPath: "/" }
      ],
      TX
    );
    expect(deps.projectDAL.findEffectiveProjectSubjectsMembership).toHaveBeenNthCalledWith(1, {
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      userIds: ["user-1", "user-2"],
      groupIds: ["g-1"]
    });
  });

  test("returns the legacy secret approval policy shape", async () => {
    const { service } = buildService();

    const policy = await create(service, { environment: undefined, environments: ["dev", "prod"] });

    expect(policy).toEqual({
      id: "policy-1",
      name: "dev-policy",
      secretPath: "/",
      approvals: 1,
      envId: ENV_DEV.id,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      enforcementLevel: EnforcementLevel.Hard,
      deletedAt: null,
      allowedSelfApprovals: true,
      bypassForMachineIdentities: false,
      projectId: PROJECT_ID,
      environments: [ENV_DEV, ENV_PROD],
      environment: ENV_DEV
    });
  });
});
