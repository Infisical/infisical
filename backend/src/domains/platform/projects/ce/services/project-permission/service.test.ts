import { randomUUID } from "node:crypto";

import { packRules } from "@casl/ability/extra";

import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { ActorContextMemo } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { PAST, TSeedActor, TSeedRole } from "@app/domains/platform/access-control/ce/testing/grant-fixture";
import {
  actorContext,
  actorOrg,
  identityPrincipal,
  userPrincipal
} from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import { ActorType } from "@app/lib/auth/actor-types";
import type { TPrincipal, TUserPrincipal } from "@app/lib/auth/principal";

import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "../../models/project-permission-set";
import { genericProjectRoles } from "../../models/project-roles";
import { StandardProjectRoles, TProjectRoles, TProjectRule } from "../../models/standard-project-roles";
import { buildProjects } from "../../testing/build-projects";
import { InMemoryProjectCache } from "../../testing/in-memory-project-cache";
import { InMemoryProjectStore } from "../../testing/in-memory-project-store";
import { ProjectPermissionService } from "./service";

const createMember = { action: ProjectPermissionMemberActions.Create, subject: ProjectPermissionSub.Member } as const;
const readMember = { action: ProjectPermissionMemberActions.Read, subject: ProjectPermissionSub.Member } as const;
const editTags = { action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags } as const;
const readValueAt = (secretPath: string) =>
  ({
    action: ProjectPermissionSecretActions.ReadValue,
    subject: ProjectPermissionSub.Secrets,
    fields: { environment: "prod", secretPath }
  }) as const;

const readOnlyMember: TProjectRule[] = [
  { action: ProjectPermissionMemberActions.Read, subject: ProjectPermissionSub.Member }
];

const pamRoles = (): TProjectRoles =>
  new StandardProjectRoles(ProjectType.PAM, {
    [ProjectMembershipRole.Admin]: genericProjectRoles.admin,
    [ProjectMembershipRole.Member]: readOnlyMember
  });

const arrange = ({
  type = ProjectType.SecretManager,
  projectRoles = []
}: { type?: ProjectType; projectRoles?: TProjectRoles[] } = {}) => {
  const projects = buildProjects({ projectRoles });
  const org = actorOrg();
  const orgId = org.id;
  const project = projects.projectStore.add({ orgId, type });
  const projectId = project.id;
  const userId = randomUUID();
  const actor = (principal: Partial<TUserPrincipal> = {}, orgOverrides: Partial<{ id: string }> = {}) =>
    actorContext({
      principal: userPrincipal({ id: userId, username: "ada", ...principal }),
      org: actorOrg({ ...org, ...orgOverrides })
    });
  const as = (principal: TPrincipal) => actorContext({ principal, org });
  const addRoles = (roles: TSeedRole[], who: TSeedActor | { groupId: string } = { userId }) =>
    projects.seed.membership({ scope: AccessScope.Project, orgId, projectId, actor: who, roles });
  const addRole = (role: string, options: { customRoleId?: string; who?: TSeedActor } = {}) =>
    addRoles([{ role, customRoleId: options.customRoleId }], options.who);
  const addCustomRole = (rules: TProjectRule[], slug = `custom-${randomUUID()}`) =>
    projects.seed.role({ owner: { projectId }, slug, permissions: packRules(rules) });
  const service = projects.projectPermissionService;
  return { ...projects, service, actor, as, addRole, addRoles, addCustomRole, orgId, projectId, userId, org };
};

describe("ProjectPermissionService.getProjectPermission", () => {
  test("should give a generic project member the generic member rights", async () => {
    // Setup
    const { service, actor, addRole, projectId } = arrange();
    await addRole(ProjectMembershipRole.Member);

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(createMember)).toBe(true);
    expect(permission.isAdmin).toBe(false);
    expect(permission.project.id).toBe(projectId);
  });

  test("should give a member of a product with its own roles only those roles' rights", async () => {
    // Setup
    const { service, actor, addRole, projectId } = arrange({ type: ProjectType.PAM, projectRoles: [pamRoles()] });
    await addRole(ProjectMembershipRole.Member);

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(readMember)).toBe(true);
    expect(permission.can(createMember)).toBe(false);
  });

  test("should use the generic roles for a project type no product passed roles for", async () => {
    // Setup
    const { service, actor, addRole, projectId } = arrange({ type: ProjectType.KMS, projectRoles: [pamRoles()] });
    await addRole(ProjectMembershipRole.Member);

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(createMember)).toBe(true);
  });

  test("should apply a customer's custom role as written", async () => {
    // Setup
    const { service, actor, addRole, addCustomRole, projectId } = arrange();
    const role = await addCustomRole([createMember]);
    await addRole(ProjectMembershipRole.Custom, { customRoleId: role.id });

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(createMember)).toBe(true);
    expect(permission.hasRole({ slug: role.slug })).toBe(true);
  });

  test("should apply a project-wide privilege on top of the roles", async () => {
    // Setup
    const { service, seed, actor, addRole, projectId, userId } = arrange();
    await addRole(ProjectMembershipRole.Viewer);
    await seed.privilege({ actor: { userId }, projectId, permissions: packRules([editTags]) });

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(editTags)).toBe(true);
  });

  test("should leave out a temporary role that has ended and keep the rest", async () => {
    // Setup
    const { service, actor, addRoles, projectId } = arrange();
    await addRoles([
      { role: ProjectMembershipRole.Admin, temporaryAccessEndTime: PAST() },
      { role: ProjectMembershipRole.Viewer }
    ]);

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.isAdmin).toBe(false);
    expect(permission.can(readMember)).toBe(true);
    expect(permission.can(createMember)).toBe(false);
  });

  test("should grant nothing for a role slug the project type does not define", async () => {
    // Setup
    const { service, actor, addRole, projectId } = arrange();
    await addRole("ssh-host-bootstrapper");

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.rules).toEqual([]);
  });

  test("should fill {{identity.username}} and metadata in a custom role's conditions", async () => {
    // Setup
    const { service, seed, actor, addRole, addCustomRole, projectId, orgId, userId } = arrange();
    const role = await addCustomRole([
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { secretPath: "/{{identity.metadata.team}}/{{identity.username}}" }
      } as TProjectRule
    ]);
    await addRole(ProjectMembershipRole.Custom, { customRoleId: role.id });
    await seed.attribute({ orgId, actor: { userId }, key: "team", value: "payments" });

    // Action
    const permission = await service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(readValueAt("/payments/ada"))).toBe(true);
    expect(permission.can(readValueAt("/payments/bob"))).toBe(false);
  });

  test("should fill {{identity.auth.*}} from the identity making the request", async () => {
    // Setup
    const { service, as, addRole, addCustomRole, projectId } = arrange();
    const identity = identityPrincipal({ authInfo: { kubernetes: { namespace: "billing" } } });
    const role = await addCustomRole([
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { secretPath: "/{{identity.auth.kubernetes.namespace}}" }
      } as TProjectRule
    ]);
    await addRole(ProjectMembershipRole.Custom, { customRoleId: role.id, who: { identityId: identity.id } });

    // Action
    const permission = await service.getProjectPermission({ actor: as(identity), projectId });

    // Assert
    expect(permission.can(readValueAt("/billing"))).toBe(true);
  });

  test("should leave a delegated OAuth token secret reads only and no roles, even for an admin", async () => {
    // Setup
    const { service, actor, addRole, projectId } = arrange();
    await addRole(ProjectMembershipRole.Admin);

    // Action
    const permission = await service.getProjectPermission({
      actor: actor({ oauth: { clientId: "client", scopes: ["secrets:read"] } }),
      projectId
    });

    // Assert
    expect(permission.can(readValueAt("/"))).toBe(true);
    expect(permission.can(createMember)).toBe(false);
    expect(permission.hasRole({ slug: ProjectMembershipRole.Admin })).toBe(false);
    expect(permission.isAdmin).toBe(false);
  });

  test("should use the assumed actor's grants inside its project and fill in the assumed actor's name", async () => {
    // Setup
    const { service, actor, addRole, addCustomRole, projectId } = arrange();
    const assumedId = randomUUID();
    const role = await addCustomRole([
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { secretPath: "/{{identity.username}}" }
      } as TProjectRule
    ]);
    await addRole(ProjectMembershipRole.Admin);
    await addRole(ProjectMembershipRole.Custom, { customRoleId: role.id, who: { identityId: assumedId } });

    // Action
    const permission = await service.getProjectPermission({
      actor: actor({
        assumed: { projectId, actorType: ActorType.IDENTITY, actorId: assumedId, actorName: "deployer" }
      }),
      projectId
    });

    // Assert
    expect(permission.isAdmin).toBe(false);
    expect(permission.can(readValueAt("/deployer"))).toBe(true);
    expect(permission.can(readValueAt("/ada"))).toBe(false);
  });

  test("should use the principal's own grants in a project other than the assumed one", async () => {
    // Setup
    const { service, actor, addRole, projectId } = arrange();
    await addRole(ProjectMembershipRole.Admin);

    // Action
    const permission = await service.getProjectPermission({
      actor: actor({
        assumed: { projectId: randomUUID(), actorType: ActorType.USER, actorId: randomUUID(), actorName: "viewer" }
      }),
      projectId
    });

    // Assert
    expect(permission.isAdmin).toBe(true);
  });

  test("should refuse a project that belongs to another org with the legacy 403 message", async () => {
    // Setup
    const { service, actor, addRole, projectId } = arrange();
    await addRole(ProjectMembershipRole.Admin);

    // Action
    const result = service.getProjectPermission({ actor: actor({}, { id: randomUUID() }), projectId });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(result).rejects.toMatchObject({
      message: "This project does not belong to your selected organization.",
      hasDefaultName: true
    });
  });

  test("should refuse a check for another product's project type with the legacy 400 message", async () => {
    // Setup
    const { service, actor, addRole, projectId } = arrange();
    await addRole(ProjectMembershipRole.Admin);

    // Action
    const result = service.getProjectPermission({ actor: actor(), projectId, type: ProjectType.PAM });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow(
      `The project is of type ${ProjectType.SecretManager}. Operations of type ${ProjectType.PAM} are not allowed.`
    );
  });

  test("should refuse a non-member with a 403 named ProjectMembershipNotFound", async () => {
    // Setup
    const { service, actor, projectId } = arrange();

    // Action
    const result = service.getProjectPermission({ actor: actor(), projectId });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(result).rejects.toMatchObject({
      name: "ProjectMembershipNotFound",
      message: `You are not a member of this project with ID ${projectId}. Please assign this user to the project with the appropriate permissions, then try again.`
    });
  });

  test("should name the identity in the refusal for an identity that is not a member", async () => {
    // Setup
    const { service, as, projectId } = arrange();

    // Action
    const result = service.getProjectPermission({ actor: as(identityPrincipal()), projectId });

    // Assert
    await expect(result).rejects.toThrow(`Please assign this identity to the project`);
  });

  test("should refuse a project that does not exist", async () => {
    // Setup
    const { service, actor } = arrange();
    const missing = randomUUID();

    // Action
    const result = service.getProjectPermission({ actor: actor(), projectId: missing });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow(`Project with ID '${missing}' not found`);
  });

  test("should refuse a machine principal that is neither a user nor an identity", async () => {
    // Setup
    const { service, as, projectId } = arrange();

    // Action
    const result = service.getProjectPermission({
      actor: as({ type: ActorType.GATEWAY, id: randomUUID() }),
      projectId
    });

    // Assert
    await expect(result).rejects.toThrow("Invalid actor provided");
  });
});

describe("ProjectPermissionService.findProjectAccess", () => {
  test("should find nothing for a non-member, and still refuse another org's project", async () => {
    // Setup
    const { service, actor, projectId } = arrange();

    // Action
    const nonMember = await service.findProjectAccess({ actor: actor(), projectId });
    const otherOrg = service.findProjectAccess({ actor: actor({}, { id: randomUUID() }), projectId });

    // Assert
    expect(nonMember).toBeNull();
    await expect(otherOrg).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe("ProjectPermissionService constructor", () => {
  test("should refuse two products passing roles for the same project type", () => {
    // Setup
    const { actorGrantsService, roleService, groupService } = buildAccessControl();

    // Action
    const build = () =>
      new ProjectPermissionService(
        new InMemoryProjectStore(),
        new InMemoryProjectCache(),
        actorGrantsService,
        roleService,
        groupService,
        [pamRoles(), pamRoles()],
        new ActorContextMemo()
      );

    // Assert
    expect(build).toThrow(`Project roles for project type '${ProjectType.PAM}' are passed twice`);
  });
});

describe("ProjectPermissionService.getProjectRoles", () => {
  test("should give the roles a product passed for its type and the generic roles otherwise", () => {
    // Setup
    const pam = pamRoles();
    const { service } = arrange({ projectRoles: [pam] });

    // Action
    const [forPam, forKms] = [ProjectType.PAM, ProjectType.KMS].map((projectType) =>
      service.getProjectRoles({ projectType })
    );

    // Assert
    expect(forPam).toBe(pam);
    expect(forKms.projectType).toBe(ProjectType.KMS);
  });
});

describe("ProjectPermissionService.getProjectPermissionByRoles", () => {
  test("should give a built-in slug its rules under its own name and a custom slug its role", async () => {
    // Setup
    const { service, addCustomRole, projectId } = arrange();
    const role = await addCustomRole([editTags], "release-manager");

    // Action
    const result = await service.getProjectPermissionByRoles({
      projectId,
      roles: [ProjectMembershipRole.Admin, "release-manager"]
    });

    // Assert
    expect(result.map(({ role: found }) => [found.name, found.slug])).toEqual([
      [ProjectMembershipRole.Admin, ProjectMembershipRole.Admin],
      ["release-manager", "release-manager"]
    ]);
    expect(result[0].permission.can(createMember)).toBe(true);
    expect(result[1].permission.can(editTags)).toBe(true);
    expect(result[1].role.id).toBe(role.id);
  });

  test("should refuse a slug with no role so assigning a role that does not exist fails", async () => {
    // Setup
    const { service, projectId } = arrange();

    // Action
    const result = service.getProjectPermissionByRoles({ projectId, roles: ["ssh-host-bootstrapper"] });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow(
      `Specified roles 'ssh-host-bootstrapper' was not found in the project with ID '${projectId}'`
    );
  });

  test("should drop an unresolved slug when told to and still resolve a custom role next to it", async () => {
    // Setup
    const { service, addCustomRole, projectId } = arrange();
    await addCustomRole([editTags], "release-manager");

    // Action
    const result = await service.getProjectPermissionByRoles({
      projectId,
      roles: ["release-manager", "ssh-host-bootstrapper"],
      ignoreUnresolvedRoles: true
    });

    // Assert
    expect(result.map(({ role }) => role.slug)).toEqual(["release-manager"]);
  });

  test("should return nothing when told to drop slugs and none resolves", async () => {
    // Setup
    const { service, projectId } = arrange();

    // Action
    const result = await service.getProjectPermissionByRoles({
      projectId,
      roles: ["ssh-host-bootstrapper"],
      ignoreUnresolvedRoles: true
    });

    // Assert
    expect(result).toEqual([]);
  });

  test("should look up no custom role for a built-in slug", async () => {
    // Setup
    const { service, roleService, projectId } = arrange();
    const findRolesBySlugs = vi.spyOn(roleService, "findRolesBySlugs");

    // Action
    const result = await service.getProjectPermissionByRoles({
      projectId,
      roles: [ProjectMembershipRole.Admin],
      ignoreUnresolvedRoles: true
    });

    // Assert
    expect(result).toHaveLength(1);
    expect(findRolesBySlugs).toHaveBeenCalledWith({ owner: { projectId }, slugs: [] });
  });

  test("should resolve a built-in slug as the project's product defines it", async () => {
    // Setup
    const { service, projectId } = arrange({ type: ProjectType.PAM, projectRoles: [pamRoles()] });

    // Action
    const [member] = await service.getProjectPermissionByRoles({ projectId, roles: [ProjectMembershipRole.Member] });

    // Assert
    expect(member.permission.can(readMember)).toBe(true);
    expect(member.permission.can(createMember)).toBe(false);
  });
});

describe("ProjectPermissionService.getGrantPermissions", () => {
  test("should return one permission per active role and project-wide privilege", async () => {
    // Setup
    const { service, seed, addRoles, orgId, projectId, userId } = arrange();
    await addRoles([
      { role: ProjectMembershipRole.Viewer },
      { role: ProjectMembershipRole.Admin, temporaryAccessEndTime: PAST() }
    ]);
    await seed.privilege({ actor: { userId }, projectId, permissions: packRules([editTags]) });

    // Action
    const permissions = await service.getGrantPermissions({
      actor: { type: ActorType.USER, id: userId, name: "ada" },
      orgId,
      projectId
    });

    // Assert
    expect(permissions).toHaveLength(2);
    expect(permissions.map((permission) => permission.can(editTags))).toEqual([false, true]);
  });

  test("should fill the target's name and metadata, and leave identity.auth and unknown metadata unrendered", async () => {
    // Setup
    const { service, seed, addRole, addCustomRole, orgId, projectId } = arrange();
    const identityId = randomUUID();
    const role = await addCustomRole([
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { secretPath: { $glob: "/{{identity.metadata.team}}/**" }, environment: "{{identity.username}}" }
      } as TProjectRule,
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { secretPath: "/{{identity.auth.kubernetes.namespace}}/{{identity.metadata.region}}" }
      } as TProjectRule
    ]);
    await addRole(ProjectMembershipRole.Custom, { customRoleId: role.id, who: { identityId } });
    await seed.attribute({ orgId, actor: { identityId }, key: "team", value: "backend" });

    // Action
    const [permission] = await service.getGrantPermissions({
      actor: { type: ActorType.IDENTITY, id: identityId, name: "target-identity" },
      orgId,
      projectId
    });

    // Assert
    expect(permission.rules.map((rule) => rule.conditions)).toEqual([
      { secretPath: { $glob: "/backend/**" }, environment: "target-identity" },
      { secretPath: "/{{identity.auth.kubernetes.namespace}}/{{identity.metadata.region}}" }
    ]);
  });

  test("should fill the target's name and metadata into a project-wide privilege's placeholders", async () => {
    // Setup
    const { service, seed, addRole, orgId, projectId } = arrange();
    const identityId = randomUUID();
    await addRole(ProjectMembershipRole.NoAccess, { who: { identityId } });
    await seed.privilege({
      actor: { identityId },
      projectId,
      permissions: packRules([
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: { secretPath: { $glob: "/{{identity.metadata.team}}/**" }, environment: "{{identity.username}}" }
        } as TProjectRule
      ])
    });
    await seed.attribute({ orgId, actor: { identityId }, key: "team", value: "backend" });

    // Action
    const permissions = await service.getGrantPermissions({
      actor: { type: ActorType.IDENTITY, id: identityId, name: "target-identity" },
      orgId,
      projectId
    });

    // Assert
    expect(permissions.map((permission) => permission.rules.map((rule) => rule.conditions))).toEqual([
      [{ secretPath: { $glob: "/backend/**" }, environment: "target-identity" }]
    ]);
  });

  test("should return a role inherited through a group like a direct one", async () => {
    // Setup
    const { service, seed, addRole, orgId, projectId, userId } = arrange();
    const group = await seed.group({ orgId });
    await seed.groupMember({ groupId: group.id, userId });
    await addRole(ProjectMembershipRole.Member);
    await seed.membership({
      scope: AccessScope.Project,
      orgId,
      projectId,
      actor: { groupId: group.id },
      roles: [{ role: ProjectMembershipRole.Admin }]
    });

    // Action
    const permissions = await service.getGrantPermissions({
      actor: { type: ActorType.USER, id: userId, name: "ada" },
      orgId,
      projectId
    });

    // Assert
    expect(permissions).toHaveLength(2);
  });
});

describe("ProjectPermissionService.getPermissionAuditSources", () => {
  test("should list direct roles, group roles and project-wide privileges, leaving out ended ones", async () => {
    // Setup
    const { service, seed, addRoles, addCustomRole, orgId, projectId, userId } = arrange();
    const role = await addCustomRole([editTags], "release-manager");
    const direct = await addRoles([
      { role: ProjectMembershipRole.Custom, customRoleId: role.id },
      { role: ProjectMembershipRole.Admin, temporaryAccessEndTime: PAST() }
    ]);
    const group = await seed.group({ orgId });
    await seed.groupMember({ groupId: group.id, userId });
    const viaGroup = await seed.membership({
      scope: AccessScope.Project,
      orgId,
      projectId,
      actor: { groupId: group.id },
      roles: [{ role: ProjectMembershipRole.Viewer }]
    });
    const privilege = await seed.privilege({ actor: { userId }, projectId, permissions: packRules([editTags]) });

    // Action
    const { sources } = await service.getPermissionAuditSources({
      target: { type: ActorType.USER, id: userId },
      orgId,
      projectId
    });

    // Assert
    expect(
      sources.map(({ id, type, name, slug, groupId, groupName, isTemporary }) => ({
        id,
        type,
        name,
        slug,
        groupId,
        groupName,
        isTemporary
      }))
    ).toEqual(
      expect.arrayContaining([
        {
          id: direct.roles[0].id,
          type: "role",
          name: "release-manager",
          slug: ProjectMembershipRole.Custom,
          groupId: undefined,
          groupName: undefined,
          isTemporary: false
        },
        {
          id: viaGroup.roles[0].id,
          type: "group_role",
          name: ProjectMembershipRole.Viewer,
          slug: ProjectMembershipRole.Viewer,
          groupId: group.id,
          groupName: group.name,
          isTemporary: false
        },
        {
          id: privilege.id,
          type: "additional_privilege",
          name: privilege.name,
          slug: undefined,
          groupId: undefined,
          groupName: undefined,
          isTemporary: false
        }
      ])
    );
    expect(sources).toHaveLength(3);
    expect(sources.find(({ id }) => id === privilege.id)?.permissions).toEqual(packRules([editTags]));
  });

  test("should refuse a target that is not a member of the project", async () => {
    // Setup
    const { service, orgId, projectId } = arrange();
    const targetId = randomUUID();

    // Action
    const result = service.getPermissionAuditSources({
      target: { type: ActorType.IDENTITY, id: targetId },
      orgId,
      projectId
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow(
      `Target identity with ID '${targetId}' is not a member of project with ID '${projectId}' [targetIdentityId=${targetId}] [projectId=${projectId}]`
    );
  });
});
