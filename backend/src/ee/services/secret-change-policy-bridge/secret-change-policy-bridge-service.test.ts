import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { ProjectVersion } from "@app/db/schemas";
import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { EnforcementLevel } from "@app/lib/types";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { ActorType } from "@app/services/auth/auth-type";

import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";
import { ProjectPermissionActions, ProjectPermissionSet, ProjectPermissionSub } from "../permission/project-permission";
import { RequestState } from "../secret-approval-request/secret-approval-request-types";
import { TSecretChangePolicyRow } from "./secret-change-policy-bridge-dal";
import { toSecretChangePolicy } from "./secret-change-policy-bridge-fns";
import { secretChangePolicyBridgeServiceFactory } from "./secret-change-policy-bridge-service";

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const ENV_DEV = { id: "env-dev", name: "Development", slug: "dev", projectId: PROJECT_ID };
const ENV_PROD = { id: "env-prod", name: "Production", slug: "prod", projectId: PROJECT_ID };
const TX = { isTx: true } as unknown as Knex;

const allow = (action: ProjectPermissionActions) =>
  createMongoAbility<ProjectPermissionSet>([{ action, subject: ProjectPermissionSub.SecretApproval }], {
    conditionsMatcher
  });
const allowCreate = allow(ProjectPermissionActions.Create);
const allowEdit = allow(ProjectPermissionActions.Edit);
const allowDelete = allow(ProjectPermissionActions.Delete);
const allowRead = allow(ProjectPermissionActions.Read);
const denyAll = createMongoAbility<ProjectPermissionSet>([], { conditionsMatcher });

const toPolicyEnv = (env: typeof ENV_DEV) => ({ id: env.id, name: env.name, slug: env.slug });

const buildRow = (overrides: Partial<TSecretChangePolicyRow> = {}): TSecretChangePolicyRow => ({
  id: "policy-1",
  projectId: PROJECT_ID,
  organizationId: ORG_ID,
  type: ApprovalPolicyType.SecretChange,
  name: "dev-policy",
  isActive: true,
  maxRequestTtl: null,
  conditions: { version: 1, conditions: [] },
  constraints: { version: 1, constraints: { allowedSelfApprovals: true } },
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  bypassForMachineIdentities: false,
  enforcementLevel: EnforcementLevel.Hard,
  scopeType: null,
  scopeId: null,
  secretPath: "/",
  environments: [toPolicyEnv(ENV_DEV)],
  steps: [{ id: "step-1", stepNumber: 1, requiredApprovals: 1 }],
  approvers: [{ type: ApproverType.User, id: "user-1", username: "alice@example.com" }],
  bypassers: [],
  userApprovers: [{ userId: "user-1" }],
  ...overrides
});

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
type TFindFilter = { policyId?: string; projectId?: string; envId?: string; organizationId?: string };

// Only the collaborators the service touches; everything else is left undefined so an
// unexpected reach shows up as a crash rather than a silent pass.
const buildService = ({
  permission = allowCreate,
  plan = { secretApproval: true },
  project = { id: PROJECT_ID, version: ProjectVersion.V3 } as { id: string; version: ProjectVersion } | null,
  envs = [ENV_DEV, ENV_PROD],
  users = [] as { id: string; username: string }[],
  existingPolicy = undefined as TExistingPolicy | undefined,
  existingLegacyPolicy = undefined as TExistingPolicy | undefined,
  memberships = [{ effectiveUserIds: ["user-1"], effectiveGroupIds: [] }] as TMembership[],
  rows = [buildRow()] as TSecretChangePolicyRow[]
} = {}) => {
  const findEffectiveProjectSubjectsMembership = vi.fn();
  memberships.forEach((membership) => findEffectiveProjectSubjectsMembership.mockResolvedValueOnce(membership));

  const deps = {
    approvalPolicyDAL: {
      findOne: vi.fn().mockResolvedValue(undefined),
      findByIdForUpdate: vi.fn((id: string) => Promise.resolve(rows.find((row) => row.id === id))),
      create: vi.fn((row: Record<string, unknown>) =>
        Promise.resolve({
          id: "policy-1",
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
          ...row
        })
      ),
      updateById: vi.fn((id: string, row: Record<string, unknown>) =>
        Promise.resolve({ ...rows.find((el) => el.id === id), ...row })
      ),
      deleteById: vi.fn((id: string) => Promise.resolve(rows.find((row) => row.id === id))),
      transaction: vi.fn((cb: (tx: unknown) => unknown) => Promise.resolve(cb(TX)))
    },
    approvalPolicyStepsDAL: {
      create: vi.fn((row: Record<string, unknown>) => Promise.resolve({ id: "step-1", ...row })),
      updateById: vi.fn((id: string, row: Record<string, unknown>) => Promise.resolve({ id, ...row }))
    },
    approvalPolicyStepApproversDAL: {
      insertMany: vi.fn((rows_: unknown[]) => Promise.resolve(rows_)),
      delete: vi.fn().mockResolvedValue([])
    },
    approvalPolicyBypassersDAL: {
      insertMany: vi.fn((rows_: unknown[]) => Promise.resolve(rows_)),
      delete: vi.fn().mockResolvedValue([])
    },
    approvalPolicySecretEnvironmentDAL: {
      insertMany: vi.fn((rows_: unknown[]) => Promise.resolve(rows_)),
      delete: vi.fn().mockResolvedValue([]),
      findPolicyByEnvIdAndSecretPath: vi.fn().mockResolvedValue(existingPolicy)
    },
    approvalRequestDAL: { update: vi.fn().mockResolvedValue([]) },
    secretChangePolicyBridgeDAL: {
      findSecretChangePolicies: vi.fn<(filter: TFindFilter, tx?: Knex) => Promise<TSecretChangePolicyRow[]>>(
        ({ policyId, projectId, envId, organizationId }) =>
          Promise.resolve(
            rows.filter(
              (row) =>
                (!policyId || row.id === policyId) &&
                (!projectId || row.projectId === projectId) &&
                (!organizationId || row.organizationId === organizationId) &&
                (!envId || row.environments.some((env) => env.id === envId))
            )
          )
      )
    },
    secretApprovalPolicyDAL: { findPolicyByEnvIdAndSecretPath: vi.fn().mockResolvedValue(existingLegacyPolicy) },
    projectEnvDAL: {
      find: vi.fn(({ $in }: { $in: { slug: string[] } }) =>
        Promise.resolve(envs.filter((env) => $in.slug.includes(env.slug)))
      )
    },
    projectDAL: { findById: vi.fn().mockResolvedValue(project), findEffectiveProjectSubjectsMembership },
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
    const { service } = buildService({
      memberships: [{ effectiveUserIds: [], effectiveGroupIds: ["g-1"] }],
      rows: [buildRow({ steps: [{ id: "step-1", stepNumber: 1, requiredApprovals: 5 }] })]
    });

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

  test("rejects a project that has not been upgraded to the latest secrets version", async () => {
    const { service, deps } = buildService({ project: { id: PROJECT_ID, version: ProjectVersion.V2 } });

    const result = create(service);
    await expect(result).rejects.toBeInstanceOf(BadRequestError);
    await expect(result).rejects.toThrow("upgraded to the latest secrets version");
    expect(deps.projectDAL.findById).toHaveBeenCalledWith(PROJECT_ID);
    expect(deps.licenseService.getPlan).not.toHaveBeenCalled();
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("reports a missing project as not found", async () => {
    const { service, deps } = buildService({ project: null });

    const result = create(service);
    await expect(result).rejects.toBeInstanceOf(NotFoundError);
    await expect(result).rejects.toThrow(`Project with ID '${PROJECT_ID}' not found`);
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

  test("returns the policy re-read inside the transaction in the legacy shape", async () => {
    const row = buildRow({
      environments: [toPolicyEnv(ENV_DEV), toPolicyEnv(ENV_PROD)],
      bypassers: [{ type: BypasserType.Group, id: "g-2" }]
    });
    const { service, deps } = buildService({ rows: [row] });

    const policy = await create(service, { environment: undefined, environments: ["dev", "prod"] });

    expect(deps.secretChangePolicyBridgeDAL.findSecretChangePolicies).toHaveBeenLastCalledWith(
      { policyId: "policy-1" },
      TX
    );
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
      environments: [toPolicyEnv(ENV_DEV), toPolicyEnv(ENV_PROD)],
      environment: toPolicyEnv(ENV_DEV),
      approvers: [{ type: ApproverType.User, id: "user-1", username: "alice@example.com" }],
      bypassers: [{ type: BypasserType.Group, id: "g-2" }],
      userApprovers: [{ userId: "user-1" }]
    });
  });
});

describe("secretChangePolicyBridge updateSecretChangePolicy", () => {
  test("rejects a policy id that does not live on the global approval system", async () => {
    const { service, deps } = buildService({ permission: allowEdit, rows: [] });

    const result = update(service);
    await expect(result).rejects.toBeInstanceOf(NotFoundError);
    await expect(result).rejects.toThrow("Secret approval policy with ID 'policy-1' not found");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("looks the policy up within the actor's organization", async () => {
    const { service, deps } = buildService({ permission: allowEdit, rows: [buildRow({ organizationId: "org-2" })] });

    await expect(update(service)).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.secretChangePolicyBridgeDAL.findSecretChangePolicies).toHaveBeenCalledWith({
      policyId: "policy-1",
      organizationId: ORG_ID
    });
  });

  test("rejects an actor without edit permission on secret approvals", async () => {
    const { service, deps } = buildService({ permission: denyAll });

    await expect(update(service)).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects when the plan does not include secret approvals", async () => {
    const { service, deps } = buildService({ permission: allowEdit, plan: { secretApproval: false } });

    await expect(update(service)).rejects.toThrow(
      "Failed to update secret approval policy due to plan restriction. Upgrade plan to update secret approval policy."
    );
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects approvals greater than the number of user approvers", async () => {
    const { service, deps } = buildService({ permission: allowEdit });

    await expect(update(service, { approvals: 2 })).rejects.toThrow("Approvals cannot be greater than approvers");
    expectNoWrites(deps);
  });

  test("rejects an environment slug that does not exist in the project", async () => {
    const { service, deps } = buildService({ permission: allowEdit, envs: [ENV_DEV] });

    const result = update(service, { environments: ["dev", "staging"] });
    await expect(result).rejects.toBeInstanceOf(NotFoundError);
    await expect(result).rejects.toThrow("One or more environments not found: staging");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects an empty environment list", async () => {
    const { service, deps } = buildService({ permission: allowEdit });

    await expect(update(service, { environments: [] })).rejects.toThrow("At least one environment must be provided");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("rejects moving onto a path another global approval system policy already governs, excluding itself", async () => {
    const { service, deps } = buildService({
      permission: allowEdit,
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
      memberships: [{ effectiveUserIds: [], effectiveGroupIds: [] }]
    });

    await expect(update(service)).rejects.toThrow("Some users are not members of the project: user-1");
    expect(deps.approvalPolicyDAL.transaction).not.toHaveBeenCalled();
  });

  test("locks the policy row before reading its state and rewriting it", async () => {
    const { service, deps } = buildService({ permission: allowEdit });

    await update(service, { secretPath: "/moved" });

    expect(deps.approvalPolicyDAL.findByIdForUpdate).toHaveBeenCalledWith("policy-1", TX);
    const lockOrder = deps.approvalPolicyDAL.findByIdForUpdate.mock.invocationCallOrder[0];
    const stateRead = deps.secretChangePolicyBridgeDAL.findSecretChangePolicies.mock.calls.findIndex(
      ([, tx]) => tx === TX
    );
    expect(deps.secretChangePolicyBridgeDAL.findSecretChangePolicies.mock.calls[stateRead]).toEqual([
      { policyId: "policy-1" },
      TX
    ]);
    expect(lockOrder).toBeLessThan(
      deps.secretChangePolicyBridgeDAL.findSecretChangePolicies.mock.invocationCallOrder[stateRead]
    );
    expect(lockOrder).toBeLessThan(
      deps.approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdAndSecretPath.mock.invocationCallOrder[0]
    );
    expect(lockOrder).toBeLessThan(deps.approvalPolicyStepApproversDAL.delete.mock.invocationCallOrder[0]);
  });

  test("rejects when the policy is deleted between the lookup and the lock", async () => {
    const { service, deps } = buildService({ permission: allowEdit });
    deps.approvalPolicyDAL.findByIdForUpdate.mockResolvedValue(undefined);

    await expect(update(service)).rejects.toBeInstanceOf(NotFoundError);
    expectNoWrites(deps);
  });

  test("rewrites only approvers and bypassers when no policy field changes", async () => {
    const { service, deps } = buildService({ permission: allowEdit });

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
    const updatedRow = buildRow({
      name: "renamed",
      enforcementLevel: EnforcementLevel.Soft,
      bypassForMachineIdentities: true,
      constraints: { version: 1, constraints: { allowedSelfApprovals: false } },
      secretPath: "/new",
      environments: [toPolicyEnv(ENV_DEV), toPolicyEnv(ENV_PROD)],
      steps: [{ id: "step-1", stepNumber: 1, requiredApprovals: 2 }],
      approvers: [
        { type: ApproverType.User, id: "user-1", username: "alice@example.com" },
        { type: ApproverType.User, id: "user-2", username: "bob@example.com" },
        { type: ApproverType.Group, id: "g-1" }
      ],
      bypassers: [{ type: BypasserType.User, id: "u-3", username: "carol@example.com" }],
      userApprovers: [{ userId: "user-1" }, { userId: "user-2" }, { userId: "user-9" }]
    });
    const { service, deps } = buildService({
      permission: allowEdit,
      users: [{ id: "user-2", username: "bob@example.com" }],
      memberships: [
        { effectiveUserIds: ["user-1", "user-2"], effectiveGroupIds: ["g-1"] },
        { effectiveUserIds: ["u-3"], effectiveGroupIds: [] }
      ],
      rows: [updatedRow]
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
    expect(deps.secretChangePolicyBridgeDAL.findSecretChangePolicies).toHaveBeenLastCalledWith(
      { policyId: "policy-1" },
      TX
    );
    expect(policy).toEqual(toSecretChangePolicy(updatedRow));
  });

  test("rewrites the environment rows with the current environments when only the path changes", async () => {
    const { service, deps } = buildService({
      permission: allowEdit,
      rows: [buildRow({ environments: [toPolicyEnv(ENV_DEV), toPolicyEnv(ENV_PROD)] })]
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
    const { service, deps } = buildService({ permission: allowEdit, rows: [buildRow({ steps: [] })] });

    await update(service, { approvals: 1 });

    expect(deps.approvalPolicyStepsDAL.create).toHaveBeenCalledWith(
      { policyId: "policy-1", stepNumber: 1, requiredApprovals: 1 },
      TX
    );
    expect(deps.approvalPolicyStepsDAL.updateById).not.toHaveBeenCalled();
  });
});

describe("secretChangePolicyBridge deleteSecretChangePolicy", () => {
  test("rejects a policy id that does not live on the global approval system", async () => {
    const { service, deps } = buildService({ permission: allowDelete, rows: [] });

    await expect(remove(service)).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.approvalRequestDAL.update).not.toHaveBeenCalled();
    expect(deps.approvalPolicyDAL.deleteById).not.toHaveBeenCalled();
  });

  test("rejects an actor without delete permission on secret approvals", async () => {
    const { service, deps } = buildService({ permission: denyAll });

    await expect(remove(service)).rejects.toBeInstanceOf(ForbiddenError);
    expect(deps.approvalRequestDAL.update).not.toHaveBeenCalled();
    expect(deps.approvalPolicyDAL.deleteById).not.toHaveBeenCalled();
  });

  test("reports a policy deleted before the lock was taken as not found and writes nothing", async () => {
    const { service, deps } = buildService({ permission: allowDelete });
    deps.approvalPolicyDAL.findByIdForUpdate.mockResolvedValueOnce(undefined);

    await expect(remove(service)).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.approvalRequestDAL.update).not.toHaveBeenCalled();
    expect(deps.approvalPolicyDAL.deleteById).not.toHaveBeenCalled();
  });

  test("locks the policy, closes its open requests and hard-deletes it in one transaction, skipping the plan check", async () => {
    const { service, deps } = buildService({ permission: allowDelete });

    const policy = await remove(service);

    expect(deps.licenseService.getPlan).not.toHaveBeenCalled();
    expect(deps.approvalPolicyDAL.findByIdForUpdate).toHaveBeenCalledWith("policy-1", TX);
    expect(deps.approvalRequestDAL.update).toHaveBeenCalledWith(
      { policyId: "policy-1", status: RequestState.Open },
      { status: RequestState.Closed },
      TX
    );
    expect(deps.approvalPolicyDAL.deleteById).toHaveBeenCalledWith("policy-1", TX);
    const [lockOrder] = deps.approvalPolicyDAL.findByIdForUpdate.mock.invocationCallOrder;
    const [closeOrder] = deps.approvalRequestDAL.update.mock.invocationCallOrder;
    const [deleteOrder] = deps.approvalPolicyDAL.deleteById.mock.invocationCallOrder;
    expect(lockOrder).toBeLessThan(closeOrder);
    expect(closeOrder).toBeLessThan(deleteOrder);
    expect(policy).toMatchObject({
      id: "policy-1",
      secretPath: "/",
      approvals: 1,
      allowedSelfApprovals: true,
      projectId: PROJECT_ID,
      environments: [toPolicyEnv(ENV_DEV)],
      environment: toPolicyEnv(ENV_DEV),
      approvers: [{ type: ApproverType.User, id: "user-1", username: "alice@example.com" }]
    });
    expect(policy.deletedAt).toBeInstanceOf(Date);
  });
});

describe("secretChangePolicyBridge getSecretChangePolicyById", () => {
  const getById = (service: TService) => service.getSecretChangePolicyById({ ...ctx, sapId: "policy-1" });

  test("looks the policy up within the actor's organization and reports a miss as not found", async () => {
    const { service, deps } = buildService({ permission: allowRead, rows: [] });

    const result = getById(service);
    await expect(result).rejects.toBeInstanceOf(NotFoundError);
    await expect(result).rejects.toThrow("Secret approval policy with ID 'policy-1' not found");
    expect(deps.secretChangePolicyBridgeDAL.findSecretChangePolicies).toHaveBeenCalledWith({
      policyId: "policy-1",
      organizationId: ORG_ID
    });
    expect(deps.permissionService.getProjectPermission).not.toHaveBeenCalled();
  });

  test("rejects an actor without read permission on secret approvals", async () => {
    const { service } = buildService({ permission: denyAll });

    await expect(getById(service)).rejects.toBeInstanceOf(ForbiddenError);
  });

  test("returns the policy in the legacy shape", async () => {
    const row = buildRow();
    const { service, deps } = buildService({ permission: allowRead, rows: [row] });

    await expect(getById(service)).resolves.toEqual(toSecretChangePolicy(row));
    expect(deps.permissionService.getProjectPermission).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID })
    );
  });
});
