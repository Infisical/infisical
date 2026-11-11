import { randomUUID } from "node:crypto";

import { packRules } from "@casl/ability/extra";

import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import type { TActorContext, TActorOrg } from "@app/domains/lib/actor-context";
import { ActorMemo } from "@app/domains/lib/actor-memo";
import { ActorGrants } from "@app/domains/platform/access-control/ce/module";
import { buildAccessControlForTests } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TUserPrincipal } from "@app/lib/auth/principal";

import { Project } from "../model/project";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "./permission/project-permission";
import { genericProjectRoles } from "./permission/project-roles";
import { ProductAccessRegistry, TProjectRule } from "./product-access-registry";
import { ProjectPermissionService } from "./project-permission-service";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const createMember = { action: ProjectPermissionMemberActions.Create, subject: ProjectPermissionSub.Member } as const;
const readMember = { action: ProjectPermissionMemberActions.Read, subject: ProjectPermissionSub.Member } as const;
const readSecretValue = {
  action: ProjectPermissionSecretActions.ReadValue,
  subject: ProjectPermissionSub.Secrets,
  fields: { environment: "prod", secretPath: "/" }
} as const;

const readOnlyMember: TProjectRule[] = [
  { action: ProjectPermissionMemberActions.Read, subject: ProjectPermissionSub.Member }
];

const setup = ({ type = ProjectType.SecretManager }: { type?: ProjectType } = {}) => {
  const { service: accessControlDomain, inMemory } = buildAccessControlForTests();
  const registry = new ProductAccessRegistry();
  const orgId = randomUUID();
  const projectId = randomUUID();
  const userId = randomUUID();
  const project = Project.restore({ id: projectId, name: "payments", slug: "payments", orgId, type });
  const service = new ProjectPermissionService({
    accessControlDomain,
    registry,
    projects: {
      findById: async (id) => (id === projectId ? project : undefined),
      findDeletionState: async () => ""
    },
    memo: new ActorMemo<{ project: Project; grants: ActorGrants }>()
  });
  const org: TActorOrg = {
    id: orgId,
    name: "acme",
    rootOrgId: orgId,
    parentOrgId: orgId,
    shouldUseNewPrivilegeSystem: true,
    ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
  };
  const actor = (principal: Partial<TUserPrincipal> = {}, orgOverride?: Partial<TActorOrg>): TActorContext => ({
    principal: {
      type: ActorType.USER,
      id: userId,
      username: "ada",
      email: "ada@example.com",
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false,
      ...principal
    },
    org: { ...org, ...orgOverride },
    plan: async () => {
      throw new Error("not needed");
    }
  });
  const addRole = ({
    role,
    customRoleId,
    actorUserId = userId
  }: {
    role: string;
    customRoleId?: string;
    actorUserId?: string;
  }) =>
    inMemory!.transactionRunner.run(({ dataAccess }) =>
      dataAccess.memberships.create({
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        actorUserId,
        roles: [{ role, customRoleId }]
      })
    );
  const addCustomRole = (rules: TProjectRule[]) =>
    inMemory!.transactionRunner.run(({ dataAccess }) =>
      dataAccess.roles.create({
        projectId,
        name: "Custom",
        slug: `custom-${randomUUID()}`,
        permissions: packRules(rules)
      })
    );
  return { service, registry, actor, addRole, addCustomRole, projectId, orgId };
};

describe("ProjectPermissionService.getProjectPermission", () => {
  test("should give a generic project member the generic member rights", async () => {
    // Setup
    const { service, actor, addRole, projectId } = setup();
    await addRole({ role: ProjectMembershipRole.Member });

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(createMember)).toBe(true);
    expect(permission.isAdmin).toBe(false);
  });

  test("should give a member of a project type that registered its own roles only those roles' rights", async () => {
    // Setup
    const { service, registry, actor, addRole, projectId } = setup({ type: ProjectType.PAM });
    registry.registerDefaultRoles({
      projectType: ProjectType.PAM,
      roles: {
        [ProjectMembershipRole.Admin]: genericProjectRoles.admin,
        [ProjectMembershipRole.Member]: readOnlyMember
      }
    });
    await addRole({ role: ProjectMembershipRole.Member });

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(readMember)).toBe(true);
    expect(permission.can(createMember)).toBe(false);
  });

  test("should apply a product's custom-role override instead of the customer's rules", async () => {
    // Setup
    const { service, registry, actor, addRole, addCustomRole, projectId } = setup({ type: ProjectType.PAM });
    registry.overrideCustomRoles({ projectType: ProjectType.PAM, resolve: () => readOnlyMember });
    const role = await addCustomRole([
      { action: ProjectPermissionMemberActions.Create, subject: ProjectPermissionSub.Member }
    ]);
    await addRole({ role: ProjectMembershipRole.Custom, customRoleId: role.id });

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(createMember)).toBe(false);
    expect(permission.can(readMember)).toBe(true);
  });

  test("should apply a customer's custom role as written where no product overrides it", async () => {
    // Setup
    const { service, actor, addRole, addCustomRole, projectId } = setup();
    const role = await addCustomRole([
      { action: ProjectPermissionMemberActions.Create, subject: ProjectPermissionSub.Member }
    ]);
    await addRole({ role: ProjectMembershipRole.Custom, customRoleId: role.id });

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(createMember)).toBe(true);
  });

  test("should let a product add a role on top of the generic ones", async () => {
    // Setup
    const { service, registry, actor, addRole, projectId } = setup({ type: ProjectType.KMS });
    registry.registerDefaultRoles({
      projectType: ProjectType.KMS,
      roles: { ...genericProjectRoles, "cryptographic-operator": readOnlyMember }
    });
    await addRole({ role: "cryptographic-operator" });

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(readMember)).toBe(true);
  });

  test("should grant nothing for a role slug the project type does not define", async () => {
    // Setup
    const { service, actor, addRole, projectId } = setup();
    await addRole({ role: "ssh-host-bootstrapper" });

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(readMember)).toBe(false);
  });

  test("should fill {{identity.username}} in a custom role's conditions", async () => {
    // Setup
    const { service, actor, addRole, addCustomRole, projectId } = setup();
    const role = await addCustomRole([
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { secretPath: "/{{identity.username}}" }
      }
    ]);
    await addRole({ role: ProjectMembershipRole.Custom, customRoleId: role.id });

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can({ ...readSecretValue, fields: { environment: "prod", secretPath: "/ada" } })).toBe(true);
    expect(permission.can({ ...readSecretValue, fields: { environment: "prod", secretPath: "/bob" } })).toBe(false);
  });

  test("should leave a delegated OAuth token with secret reads only, even for an admin", async () => {
    // Setup
    const { service, actor, addRole, projectId } = setup();
    await addRole({ role: ProjectMembershipRole.Admin });

    // Action
    const permission = await service.getProjectPermission({
      actor: actor({ oauth: { clientId: "client", scopes: ["secrets:read"] } }),
      projectId
    });

    // Assert
    expect(permission.can(readSecretValue)).toBe(true);
    expect(permission.can(createMember)).toBe(false);
  });

  test("should use the assumed actor's grants inside its project", async () => {
    // Setup
    const { service, actor, addRole, projectId } = setup();
    const viewerId = randomUUID();
    await addRole({ role: ProjectMembershipRole.Admin });
    await addRole({ role: ProjectMembershipRole.NoAccess, actorUserId: viewerId });

    // Action
    const permission = await service.getProjectPermission({
      actor: actor({ assumed: { projectId, actorType: ActorType.USER, actorId: viewerId, actorName: "viewer" } }),
      projectId
    });

    // Assert
    expect(permission.isAdmin).toBe(false);
  });

  test("should refuse a project that belongs to another org", async () => {
    // Setup
    const { service, actor, addRole, projectId } = setup();
    await addRole({ role: ProjectMembershipRole.Admin });

    // Action
    const result = service.getProjectPermission({ actor: actor({}, { id: randomUUID() }), projectId });

    // Assert
    await expect(result).rejects.toThrow("This project does not belong to your selected organization.");
  });

  test("should refuse a check for another product's project type", async () => {
    // Setup
    const { service, actor, addRole, projectId } = setup();
    await addRole({ role: ProjectMembershipRole.Admin });

    // Action
    const result = service.getProjectPermission({ actor: actor(), projectId, type: ProjectType.PAM });

    // Assert
    await expect(result).rejects.toThrow(`The project is of type ${ProjectType.SecretManager}.`);
  });

  test("should refuse a non-member and a project that does not exist", async () => {
    // Setup
    const { service, actor, projectId } = setup();

    // Action
    const nonMember = service.getProjectPermission({ actor: actor(), projectId });
    const missing = service.getProjectPermission({ actor: actor(), projectId: randomUUID() });

    // Assert
    await expect(nonMember).rejects.toThrow(`You are not a member of this project with ID ${projectId}`);
    await expect(missing).rejects.toThrow("not found");
  });
});

describe("ProductAccessRegistry", () => {
  test("should refuse a second registration for the same project type", () => {
    // Setup
    const registry = new ProductAccessRegistry();
    registry.registerDefaultRoles({ projectType: ProjectType.PAM, roles: {} });

    // Action
    const again = () => registry.registerDefaultRoles({ projectType: ProjectType.PAM, roles: {} });

    // Assert
    expect(again).toThrow("already registered");
  });
});
