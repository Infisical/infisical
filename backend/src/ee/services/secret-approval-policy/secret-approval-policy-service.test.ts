import { createMongoAbility } from "@casl/ability";
import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { ProjectVersion } from "@app/db/schemas";
import { conditionsMatcher } from "@app/lib/casl";
import { EnforcementLevel } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

import { ApproverType } from "../access-approval-policy/access-approval-policy-types";
import { ProjectPermissionActions, ProjectPermissionSet, ProjectPermissionSub } from "../permission/project-permission";
import { secretApprovalPolicyServiceFactory } from "./secret-approval-policy-service";

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const ENV_DEV = { id: "env-dev", name: "Development", slug: "dev", projectId: PROJECT_ID };
const TX = { isTx: true } as unknown as Knex;

const allowAll = createMongoAbility<ProjectPermissionSet>(
  [
    { action: ProjectPermissionActions.Create, subject: ProjectPermissionSub.SecretApproval },
    { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretApproval }
  ],
  { conditionsMatcher }
);

const ctx = {
  actor: ActorType.USER,
  actorId: "actor-1",
  actorOrgId: ORG_ID,
  actorAuthMethod: null
} as unknown as Pick<
  Parameters<ReturnType<typeof secretApprovalPolicyServiceFactory>["getSecretApprovalPolicyById"]>[0],
  "actor" | "actorId" | "actorOrgId" | "actorAuthMethod"
>;

const makePolicy = (id: string, secretPath: string, createdAt: string) => ({
  id,
  secretPath,
  name: id,
  createdAt: new Date(createdAt),
  projectId: PROJECT_ID,
  bypassForMachineIdentities: false
});

type TPolicy = ReturnType<typeof makePolicy>;
type TExistingPolicy = { id: string; environments: { id: string }[] };

// Only the collaborators the read and duplicate-policy paths reach; anything else crashes the test if touched.
const buildService = ({
  bridgePolicy = undefined as TExistingPolicy | undefined,
  legacyPolicies = [] as TPolicy[],
  bridgePolicies = [] as TPolicy[],
  bridgeOwnsPolicy = false,
  projectVersion = ProjectVersion.V2
} = {}) => {
  const deps = {
    projectDAL: { findById: vi.fn().mockResolvedValue({ id: PROJECT_ID, version: projectVersion }) },
    permissionService: { getProjectPermission: vi.fn().mockResolvedValue({ permission: allowAll }) },
    licenseService: { getPlan: vi.fn().mockResolvedValue({ secretApproval: true }) },
    projectEnvDAL: {
      find: vi.fn().mockResolvedValue([ENV_DEV]),
      findOne: vi.fn(({ slug }: { slug: string }) => Promise.resolve(slug === ENV_DEV.slug ? ENV_DEV : undefined))
    },
    secretApprovalPolicyDAL: {
      findPolicyByEnvIdAndSecretPath: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue(legacyPolicies)
    },
    secretChangePolicyBridgeService: {
      findSecretChangePolicy: vi.fn().mockResolvedValue(bridgeOwnsPolicy ? { id: "bridge-policy" } : undefined),
      findSecretChangePolicyBySecretPath: vi.fn().mockResolvedValue(bridgePolicy),
      findSecretChangePoliciesByEnvId: vi.fn().mockResolvedValue(bridgePolicies),
      findSecretChangePoliciesByProjectId: vi.fn().mockResolvedValue(bridgePolicies),
      createSecretChangePolicy: vi.fn().mockResolvedValue({ id: "bridge-policy" }),
      getSecretChangePolicyById: vi.fn().mockResolvedValue({ id: "bridge-policy" })
    }
  };

  const service = secretApprovalPolicyServiceFactory(
    deps as unknown as Parameters<typeof secretApprovalPolicyServiceFactory>[0]
  );
  return { service, deps };
};

describe("secretApprovalPolicyService createSecretApprovalPolicy", () => {
  const createDto = {
    ...ctx,
    projectId: PROJECT_ID,
    name: "dev-policy",
    approvals: 1,
    approvers: [{ type: ApproverType.User, id: "user-1" }],
    secretPath: "/",
    environment: ENV_DEV.slug,
    enforcementLevel: EnforcementLevel.Hard,
    allowedSelfApprovals: true,
    bypassForMachineIdentities: false
  } as unknown as Parameters<ReturnType<typeof secretApprovalPolicyServiceFactory>["createSecretApprovalPolicy"]>[0];

  test("creates a policy on a V3 project on the global approval system", async () => {
    const { service, deps } = buildService({ projectVersion: ProjectVersion.V3 });

    await expect(service.createSecretApprovalPolicy(createDto)).resolves.toEqual({ id: "bridge-policy" });

    expect(deps.secretChangePolicyBridgeService.createSecretChangePolicy).toHaveBeenCalledWith(createDto);
    expect(deps.permissionService.getProjectPermission).not.toHaveBeenCalled();
    expect(deps.secretApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath).not.toHaveBeenCalled();
  });

  test("rejects a path and environment already governed by a policy created through the bridge", async () => {
    const { service, deps } = buildService({
      bridgePolicy: { id: "bridge-policy-1", environments: [{ id: ENV_DEV.id }] }
    });

    await expect(service.createSecretApprovalPolicy(createDto)).rejects.toThrow(
      "A policy for secret path '/' already exists in environment 'dev'"
    );

    expect(deps.secretChangePolicyBridgeService.createSecretChangePolicy).not.toHaveBeenCalled();

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

describe("secretApprovalPolicyService getSecretApprovalPolicyByProjectId", () => {
  test("lists legacy and global approval system policies together, oldest first", async () => {
    const legacy = makePolicy("legacy", "/a", "2026-01-02");
    const bridge = makePolicy("bridge", "/b", "2026-01-01");
    const { service, deps } = buildService({ legacyPolicies: [legacy], bridgePolicies: [bridge] });

    await expect(service.getSecretApprovalPolicyByProjectId({ ...ctx, projectId: PROJECT_ID })).resolves.toEqual([
      bridge,
      legacy
    ]);
    expect(deps.secretApprovalPolicyDAL.find).toHaveBeenCalledWith({ projectId: PROJECT_ID, deletedAt: null });
    expect(deps.secretChangePolicyBridgeService.findSecretChangePoliciesByProjectId).toHaveBeenCalledWith(PROJECT_ID);
  });
});

describe("secretApprovalPolicyService getSecretApprovalPolicy", () => {
  test("resolves the path over both stores and threads the transaction to each", async () => {
    const legacyGlob = makePolicy("legacy-glob", "/app/**", "2026-01-01");
    const bridgeExact = makePolicy("bridge-exact", "/app/svc", "2026-01-02");
    const { service, deps } = buildService({ legacyPolicies: [legacyGlob], bridgePolicies: [bridgeExact] });

    await expect(service.getSecretApprovalPolicy(PROJECT_ID, ENV_DEV.slug, "/app/svc", TX)).resolves.toBe(bridgeExact);
    await expect(service.getSecretApprovalPolicy(PROJECT_ID, ENV_DEV.slug, "/app/other", TX)).resolves.toBe(legacyGlob);
    expect(deps.secretApprovalPolicyDAL.find).toHaveBeenCalledWith({ deletedAt: null }, { envId: ENV_DEV.id }, TX);
    expect(deps.secretChangePolicyBridgeService.findSecretChangePoliciesByEnvId).toHaveBeenCalledWith(ENV_DEV.id, TX);
  });

  test("lets a legacy exact path win over a global approval system glob", async () => {
    const legacyExact = makePolicy("legacy-exact", "/app/svc", "2026-01-02");
    const bridgeGlob = makePolicy("bridge-glob", "/app/**", "2026-01-01");
    const { service } = buildService({ legacyPolicies: [legacyExact], bridgePolicies: [bridgeGlob] });

    await expect(service.getSecretApprovalPolicy(PROJECT_ID, ENV_DEV.slug, "/app/svc")).resolves.toBe(legacyExact);
  });

  test("breaks a tie across stores on the earliest creation", async () => {
    const legacyGlob = makePolicy("legacy-glob", "/app/**", "2026-01-02");
    const bridgeGlob = makePolicy("bridge-glob", "/app/*", "2026-01-01");
    const { service } = buildService({ legacyPolicies: [legacyGlob], bridgePolicies: [bridgeGlob] });

    await expect(service.getSecretApprovalPolicy(PROJECT_ID, ENV_DEV.slug, "/app/svc")).resolves.toBe(bridgeGlob);
  });

  test("resolves several paths against both stores with one read each", async () => {
    const legacyGlob = makePolicy("legacy-glob", "/app/**", "2026-01-01");
    const bridgeExact = makePolicy("bridge-exact", "/app/svc", "2026-01-02");
    const { service, deps } = buildService({ legacyPolicies: [legacyGlob], bridgePolicies: [bridgeExact] });

    const byPath = await service.getSecretApprovalPolicyByPaths(PROJECT_ID, ENV_DEV.slug, [
      "/app/svc",
      "/app/other",
      "/db"
    ]);

    expect(byPath.get("/app/svc")).toBe(bridgeExact);
    expect(byPath.get("/app/other")).toBe(legacyGlob);
    expect(byPath.has("/db")).toBe(false);
    expect(deps.secretApprovalPolicyDAL.find).toHaveBeenCalledTimes(1);
    expect(deps.secretChangePolicyBridgeService.findSecretChangePoliciesByEnvId).toHaveBeenCalledTimes(1);
  });
});

describe("secretApprovalPolicyService getSecretApprovalPolicyById", () => {
  test("routes a policy that lives on the global approval system to the bridge", async () => {
    const { service, deps } = buildService({ bridgeOwnsPolicy: true });

    await expect(service.getSecretApprovalPolicyById({ ...ctx, sapId: "bridge-policy" })).resolves.toEqual({
      id: "bridge-policy"
    });
    expect(deps.secretChangePolicyBridgeService.getSecretChangePolicyById).toHaveBeenCalledWith({
      ...ctx,
      sapId: "bridge-policy"
    });
    expect(deps.secretApprovalPolicyDAL.find).not.toHaveBeenCalled();
  });

  test("reads a legacy policy from the legacy tables", async () => {
    const legacy = makePolicy("legacy", "/a", "2026-01-01");
    const { service, deps } = buildService({ legacyPolicies: [legacy] });

    await expect(service.getSecretApprovalPolicyById({ ...ctx, sapId: "legacy" })).resolves.toBe(legacy);
    expect(deps.secretApprovalPolicyDAL.find).toHaveBeenCalledWith({}, { sapId: "legacy" });
    expect(deps.secretChangePolicyBridgeService.getSecretChangePolicyById).not.toHaveBeenCalled();
  });
});
