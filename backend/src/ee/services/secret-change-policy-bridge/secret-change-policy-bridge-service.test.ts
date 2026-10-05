import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { Knex } from "knex";
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
const TX = { isTx: true } as unknown as Knex;

const allowCreate = createMongoAbility<ProjectPermissionSet>(
  [{ action: ProjectPermissionActions.Create, subject: ProjectPermissionSub.SecretApproval }],
  { conditionsMatcher }
);
const allowEdit = createMongoAbility<ProjectPermissionSet>(
  [{ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.SecretApproval }],
  { conditionsMatcher }
);
const allowDelete = createMongoAbility<ProjectPermissionSet>(
  [{ action: ProjectPermissionActions.Delete, subject: ProjectPermissionSub.SecretApproval }],
  { conditionsMatcher }
);
const denyAll = createMongoAbility<ProjectPermissionSet>([], { conditionsMatcher });

const POLICY_ROW = {
  id: "policy-1",
  projectId: PROJECT_ID,
  organizationId: ORG_ID,
  type: ApprovalPolicyType.SecretChange,
  name: "dev-policy",
  enforcementLevel: EnforcementLevel.Hard,
  bypassForMachineIdentities: false,
  conditions: { version: 1, conditions: [] },
  constraints: { version: 1, constraints: { allowedSelfApprovals: true } },
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  scopeType: null,
  scopeId: null
};
const STEP_ROW = { id: "step-1", policyId: "policy-1", stepNumber: 1, requiredApprovals: 1 };
const toEnvRow = (env: typeof ENV_DEV, secretPath = "/") => ({
  id: env.id,
  name: env.name,
  slug: env.slug,
  secretPath
});
const toPolicyEnv = (env: typeof ENV_DEV) => ({ id: env.id, name: env.name, slug: env.slug });

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
type TEnvRow = ReturnType<typeof toEnvRow>;

// Only the collaborators the service touches; everything else is left undefined so an
// unexpected reach shows up as a crash rather than a silent pass.
const buildService = ({
  permission = allowCreate,
  plan = { secretApproval: true },
  envs = [ENV_DEV, ENV_PROD],
  users = [] as { id: string; username: string }[],
  existingPolicy = undefined as TExistingPolicy | undefined,
  existingLegacyPolicy = undefined as TExistingPolicy | undefined,
  memberships = [{ effectiveUserIds: ["user-1"], effectiveGroupIds: [] }] as TMembership[],
  policyRow = undefined as typeof POLICY_ROW | undefined,
  envRows = [toEnvRow(ENV_DEV)] as TEnvRow[],
  step = STEP_ROW as typeof STEP_ROW | null
} = {}) => {
  const findEffectiveProjectSubjectsMembership = vi.fn();
  memberships.forEach((membership) => findEffectiveProjectSubjectsMembership.mockResolvedValueOnce(membership));

  const deps = {
    approvalPolicyDAL: {
      findOne: vi.fn().mockResolvedValue(policyRow),
      findByIdForUpdate: vi.fn().mockResolvedValue(policyRow),
      create: vi.fn((row: Record<string, unknown>) =>
        Promise.resolve({
          id: "policy-1",
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
          ...row
        })
      ),
      updateById: vi.fn((_id: string, row: Record<string, unknown>) => Promise.resolve({ ...policyRow, ...row })),
      deleteById: vi.fn().mockResolvedValue(policyRow),
      transaction: vi.fn((cb: (tx: unknown) => unknown) => Promise.resolve(cb(TX)))
    },
    approvalPolicyStepsDAL: {
      create: vi.fn((row: Record<string, unknown>) => Promise.resolve({ id: "step-1", ...row })),
      findOne: vi.fn().mockResolvedValue(step ?? undefined),
      updateById: vi.fn((_id: string, row: Record<string, unknown>) => Promise.resolve({ ...step, ...row }))
    },
    approvalPolicyStepApproversDAL: {
      insertMany: vi.fn((rows: unknown[]) => Promise.resolve(rows)),
      delete: vi.fn().mockResolvedValue([])
    },
    approvalPolicyBypassersDAL: {
      insertMany: vi.fn((rows: unknown[]) => Promise.resolve(rows)),
      delete: vi.fn().mockResolvedValue([])
    },
    approvalPolicySecretEnvironmentDAL: {
      insertMany: vi.fn((rows: unknown[]) => Promise.resolve(rows)),
      delete: vi.fn().mockResolvedValue([]),
      findPolicyByEnvIdAndSecretPath: vi.fn().mockResolvedValue(existingPolicy),
      findEnvironmentsByPolicyId: vi.fn().mockResolvedValue(envRows)
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
type TUpdateInput = Parameters<TService["updateSecretChangePolicy"]>[0];

const update = (service: TService, overrides: Partial<TUpdateInput> = {}) =>
  service.updateSecretChangePolicy({
    ...ctx,
    secretPolicyId: "policy-1",
    approvers: [{ type: ApproverType.User, id: "user-1" }],
    ...overrides
  });

const remove = (service: TService) => service.deleteSecretChangePolicy({ ...ctx, secretPolicyId: "policy-1" });

const expectNoWrites = (deps: ReturnType<typeof buildService>["deps"]) => {
  expect(deps.approvalPolicyDAL.updateById).not.toHaveBeenCalled();
  expect(deps.approvalPolicyStepsDAL.updateById).not.toHaveBeenCalled();
  expect(deps.approvalPolicyStepApproversDAL.delete).not.toHaveBeenCalled();
  expect(deps.approvalPolicySecretEnvironmentDAL.delete).not.toHaveBeenCalled();
  expect(deps.approvalPolicyBypassersDAL.delete).not.toHaveBeenCalled();
};

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
    expect(deps.approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdAndSecretPath).toHaveBeenCalledWith(
      { envIds: [ENV_DEV.id], secretPath: "/" },
      undefined
    );
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects a second policy when the legacy secret approval tables already govern the path", async () => {
    const { service, deps } = buildService({
      existingLegacyPolicy: { id: "legacy-policy", environments: [{ id: ENV_DEV.id }] }
    });

    await expect(create(service)).rejects.toThrow("A policy for secret path '/' already exists in environment 'dev'");
    expect(deps.secretApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath).toHaveBeenCalledWith(
      { envIds: [ENV_DEV.id], secretPath: "/" },
      undefined
    );
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

describe("secretChangePolicyBridge updateSecretChangePolicy", () => {
  test("rejects a policy id that does not live on the approval system", async () => {
    const { service, deps } = buildService({ permission: allowEdit });

    const result = update(service);
    await expect(result).rejects.toBeInstanceOf(NotFoundError);
    await expect(result).rejects.toThrow("Secret approval policy with ID 'policy-1' not found");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects an actor without edit permission on secret approvals", async () => {
    const { service, deps } = buildService({ permission: denyAll, policyRow: POLICY_ROW });

    await expect(update(service)).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects when the plan does not include secret approvals", async () => {
    const { service, deps } = buildService({
      permission: allowEdit,
      policyRow: POLICY_ROW,
      plan: { secretApproval: false }
    });

    await expect(update(service)).rejects.toThrow(
      "Failed to update secret approval policy due to plan restriction. Upgrade plan to update secret approval policy."
    );
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects approvals greater than the number of user approvers", async () => {
    const { service, deps } = buildService({ permission: allowEdit, policyRow: POLICY_ROW });

    await expect(update(service, { approvals: 2 })).rejects.toThrow("Approvals cannot be greater than approvers");
    expectNoWrites(deps);
  });

  test("rejects an environment slug that does not exist in the project", async () => {
    const { service, deps } = buildService({ permission: allowEdit, policyRow: POLICY_ROW, envs: [ENV_DEV] });

    const result = update(service, { environments: ["dev", "staging"] });
    await expect(result).rejects.toBeInstanceOf(NotFoundError);
    await expect(result).rejects.toThrow("One or more environments not found: staging");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects an empty environment list", async () => {
    const { service, deps } = buildService({ permission: allowEdit, policyRow: POLICY_ROW });

    await expect(update(service, { environments: [] })).rejects.toThrow("At least one environment must be provided");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects moving onto a path another approval system policy already governs, excluding itself", async () => {
    const { service, deps } = buildService({
      permission: allowEdit,
      policyRow: POLICY_ROW,
      existingPolicy: { id: "other-policy", environments: [{ id: ENV_DEV.id }] }
    });

    await expect(update(service, { secretPath: "/shared" })).rejects.toThrow(
      "A policy for secret path '/shared' already exists in environment 'dev'"
    );
    expect(deps.approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdAndSecretPath).toHaveBeenCalledWith(
      { envIds: [ENV_DEV.id], secretPath: "/shared", excludePolicyId: "policy-1" },
      TX
    );
    expectNoWrites(deps);
  });

  test("rejects moving onto a path the legacy secret approval tables already govern", async () => {
    const { service, deps } = buildService({
      permission: allowEdit,
      policyRow: POLICY_ROW,
      existingLegacyPolicy: { id: "legacy-policy", environments: [{ id: ENV_PROD.id }] }
    });

    await expect(update(service, { environments: ["dev", "prod"] })).rejects.toThrow(
      "A policy for secret path '/' already exists in environment 'prod'"
    );
    expect(deps.secretApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath).toHaveBeenCalledWith(
      { envIds: [ENV_DEV.id, ENV_PROD.id], secretPath: "/" },
      TX
    );
    expectNoWrites(deps);
  });

  test("rejects an approver who is not a project member", async () => {
    const { service, deps } = buildService({
      permission: allowEdit,
      policyRow: POLICY_ROW,
      memberships: [{ effectiveUserIds: [], effectiveGroupIds: [] }]
    });

    await expect(update(service)).rejects.toThrow("Some users are not members of the project: user-1");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("locks the policy row before reading its state and rewriting it", async () => {
    const { service, deps } = buildService({ permission: allowEdit, policyRow: POLICY_ROW });

    await update(service, { secretPath: "/moved" });

    expect(deps.approvalPolicyDAL.findByIdForUpdate).toHaveBeenCalledWith("policy-1", TX);
    const lockOrder = deps.approvalPolicyDAL.findByIdForUpdate.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(
      deps.approvalPolicySecretEnvironmentDAL.findEnvironmentsByPolicyId.mock.invocationCallOrder[0]
    );
    expect(lockOrder).toBeLessThan(
      deps.approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdAndSecretPath.mock.invocationCallOrder[0]
    );
    expect(lockOrder).toBeLessThan(deps.approvalPolicyStepApproversDAL.delete.mock.invocationCallOrder[0]);
    expect(deps.approvalPolicySecretEnvironmentDAL.findEnvironmentsByPolicyId).toHaveBeenCalledWith("policy-1", TX);
  });

  test("rejects when the policy is deleted between the lookup and the lock", async () => {
    const { service, deps } = buildService({ permission: allowEdit, policyRow: POLICY_ROW });
    deps.approvalPolicyDAL.findByIdForUpdate.mockResolvedValue(undefined);

    await expect(update(service)).rejects.toBeInstanceOf(NotFoundError);
    expectNoWrites(deps);
  });

  test("rewrites only approvers and bypassers when no policy field changes", async () => {
    const { service, deps } = buildService({ permission: allowEdit, policyRow: POLICY_ROW });

    const policy = await update(service);

    expect(deps.approvalPolicyDAL.updateById).not.toHaveBeenCalled();
    expect(deps.approvalPolicyStepsDAL.updateById).not.toHaveBeenCalled();
    expect(deps.approvalPolicySecretEnvironmentDAL.delete).not.toHaveBeenCalled();
    expect(deps.approvalPolicySecretEnvironmentDAL.insertMany).not.toHaveBeenCalled();
    expect(deps.approvalPolicyStepApproversDAL.delete).toHaveBeenCalledWith({ policyStepId: "step-1" }, TX);
    expect(deps.approvalPolicyStepApproversDAL.insertMany).toHaveBeenCalledWith(
      [{ policyStepId: "step-1", userId: "user-1", groupId: null }],
      TX
    );
    expect(deps.approvalPolicyBypassersDAL.delete).toHaveBeenCalledWith({ policyId: "policy-1" }, TX);
    expect(deps.approvalPolicyBypassersDAL.insertMany).toHaveBeenCalledWith([], TX);
    expect(policy).toMatchObject({
      id: "policy-1",
      secretPath: "/",
      approvals: 1,
      environments: [toPolicyEnv(ENV_DEV)]
    });
  });

  test("rewrites the policy, step, approvers, environments and bypassers in one transaction", async () => {
    const { service, deps } = buildService({
      permission: allowEdit,
      policyRow: POLICY_ROW,
      users: [{ id: "user-2", username: "bob@example.com" }],
      memberships: [
        { effectiveUserIds: ["user-1", "user-2"], effectiveGroupIds: ["g-1"] },
        { effectiveUserIds: ["u-3"], effectiveGroupIds: [] }
      ]
    });

    const policy = await update(service, {
      name: "renamed",
      approvals: 2,
      enforcementLevel: EnforcementLevel.Soft,
      allowedSelfApprovals: false,
      bypassForMachineIdentities: true,
      secretPath: "/new",
      environments: ["dev", "prod"],
      approvers: [
        { type: ApproverType.User, id: "user-1" },
        { type: ApproverType.User, username: "bob@example.com" },
        { type: ApproverType.Group, id: "g-1" }
      ],
      bypassers: [{ type: BypasserType.User, id: "u-3" }]
    });

    expect(deps.approvalPolicyDAL.updateById).toHaveBeenCalledWith(
      "policy-1",
      {
        name: "renamed",
        enforcementLevel: EnforcementLevel.Soft,
        bypassForMachineIdentities: true,
        constraints: { version: 1, constraints: { allowedSelfApprovals: false } }
      },
      TX
    );
    expect(deps.approvalPolicyStepsDAL.updateById).toHaveBeenCalledWith("step-1", { requiredApprovals: 2 }, TX);
    expect(deps.approvalPolicyStepApproversDAL.delete).toHaveBeenCalledWith({ policyStepId: "step-1" }, TX);
    expect(deps.approvalPolicyStepApproversDAL.insertMany).toHaveBeenCalledWith(
      [
        { policyStepId: "step-1", userId: "user-1", groupId: null },
        { policyStepId: "step-1", userId: "user-2", groupId: null },
        { policyStepId: "step-1", userId: null, groupId: "g-1" }
      ],
      TX
    );
    expect(deps.approvalPolicySecretEnvironmentDAL.delete).toHaveBeenCalledWith({ policyId: "policy-1" }, TX);
    expect(deps.approvalPolicySecretEnvironmentDAL.insertMany).toHaveBeenCalledWith(
      [
        { policyId: "policy-1", envId: ENV_DEV.id, secretPath: "/new" },
        { policyId: "policy-1", envId: ENV_PROD.id, secretPath: "/new" }
      ],
      TX
    );
    expect(deps.approvalPolicyBypassersDAL.delete).toHaveBeenCalledWith({ policyId: "policy-1" }, TX);
    expect(deps.approvalPolicyBypassersDAL.insertMany).toHaveBeenCalledWith(
      [{ policyId: "policy-1", userId: "u-3", groupId: null }],
      TX
    );
    expect(policy).toEqual({
      id: "policy-1",
      name: "renamed",
      secretPath: "/new",
      approvals: 2,
      envId: ENV_DEV.id,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      enforcementLevel: EnforcementLevel.Soft,
      deletedAt: null,
      allowedSelfApprovals: false,
      bypassForMachineIdentities: true,
      projectId: PROJECT_ID,
      environments: [toPolicyEnv(ENV_DEV), toPolicyEnv(ENV_PROD)],
      environment: toPolicyEnv(ENV_DEV)
    });
  });

  test("rewrites the environment rows with the current environments when only the path changes", async () => {
    const { service, deps } = buildService({
      permission: allowEdit,
      policyRow: POLICY_ROW,
      envRows: [toEnvRow(ENV_DEV), toEnvRow(ENV_PROD)]
    });

    await update(service, { secretPath: "/moved" });

    expect(deps.projectEnvDAL.find).not.toHaveBeenCalled();
    expect(deps.approvalPolicySecretEnvironmentDAL.insertMany).toHaveBeenCalledWith(
      [
        { policyId: "policy-1", envId: ENV_DEV.id, secretPath: "/moved" },
        { policyId: "policy-1", envId: ENV_PROD.id, secretPath: "/moved" }
      ],
      TX
    );
  });

  test("recreates the approval step when the policy has none", async () => {
    const { service, deps } = buildService({ permission: allowEdit, policyRow: POLICY_ROW, step: null });

    await update(service, { approvals: 1 });

    expect(deps.approvalPolicyStepsDAL.create).toHaveBeenCalledWith(
      { policyId: "policy-1", stepNumber: 1, requiredApprovals: 1 },
      TX
    );
    expect(deps.approvalPolicyStepsDAL.updateById).not.toHaveBeenCalled();
  });
});

describe("secretChangePolicyBridge deleteSecretChangePolicy", () => {
  test("rejects a policy id that does not live on the approval system", async () => {
    const { service, deps } = buildService({ permission: allowDelete });

    await expect(remove(service)).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects an actor without delete permission on secret approvals", async () => {
    const { service, deps } = buildService({ permission: denyAll, policyRow: POLICY_ROW });

    await expect(remove(service)).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("hard-deletes the policy and skips the plan check", async () => {
    const { service, deps } = buildService({ permission: allowDelete, policyRow: POLICY_ROW });

    const policy = await remove(service);

    expect(deps.licenseService.getPlan).not.toHaveBeenCalled();
    expect(deps.approvalPolicyDAL.deleteById).toHaveBeenCalledWith("policy-1");
    expect(policy).toMatchObject({
      id: "policy-1",
      secretPath: "/",
      approvals: 1,
      allowedSelfApprovals: true,
      projectId: PROJECT_ID,
      environments: [toPolicyEnv(ENV_DEV)],
      environment: toPolicyEnv(ENV_DEV)
    });
    expect(policy.deletedAt).toBeInstanceOf(Date);
  });
});
