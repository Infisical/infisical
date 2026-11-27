import { randomUUID } from "node:crypto";

import { MongoAbility, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { AccessScope, ProjectMembershipRole, ProjectType, SecretFolderRole } from "@app/db/schemas";
import { EntityNotFoundError, PermissionDeniedError } from "@app/domains/lib/errors";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";

import { buildSecretsPermission } from "../../testing/build-secrets-permission";

const editSecretAt = (secretPath: string, environment = "prod") => ({
  action: ProjectPermissionSecretActions.Edit,
  subject: ProjectPermissionSub.Secrets,
  fields: { environment, secretPath }
});
const readSecretValueAt = (secretPath: string) => ({
  action: ProjectPermissionSecretActions.ReadValue,
  subject: ProjectPermissionSub.Secrets,
  fields: { environment: "prod", secretPath, secretName: "KEY", secretTags: [] }
});

type TRule = RawRuleOf<MongoAbility<ProjectPermissionSet>>;

describe("SecretsPermissionService.getSecretsPermission", () => {
  test("should let a viewer edit secrets in a folder it was granted edit on, and nowhere else", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    await t.addFolderGrant(user, "/app", SecretFolderRole.Edit);

    // Action
    const { permission, folderGrants } = await t.service.getSecretsPermission({
      actor: t.actor(user),
      projectId: t.projectId
    });

    // Assert
    expect(permission.can(editSecretAt("/app"))).toBe(true);
    expect(permission.can(editSecretAt("/other"))).toBe(false);
    expect(folderGrants.list.map((grant) => grant.secretPath)).toEqual(["/app"]);
  });

  test("should narrow a member to the folder role at the granted folder", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Member);
    await t.addFolderGrant(user, "/app", SecretFolderRole.List);

    // Action
    const { permission } = await t.service.getSecretsPermission({ actor: t.actor(user), projectId: t.projectId });

    // Assert
    expect(permission.can(readSecretValueAt("/app"))).toBe(false);
    expect(permission.can(readSecretValueAt("/other"))).toBe(true);
  });

  test("should drop a temporary folder grant that has ended", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    await t.addFolderGrant(user, "/ended", SecretFolderRole.Edit, { ended: true });

    // Action
    const { permission, folderGrants } = await t.service.getSecretsPermission({
      actor: t.actor(user),
      projectId: t.projectId
    });

    // Assert
    expect(permission.can(editSecretAt("/ended"))).toBe(false);
    expect(folderGrants.isEmpty).toBe(true);
  });

  test("should never let a folder grant restrict a built-in admin", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Admin);
    await t.addFolderGrant(user, "/app", SecretFolderRole.List);

    // Action
    const { permission, folderGrants } = await t.service.getSecretsPermission({
      actor: t.actor(user),
      projectId: t.projectId
    });

    // Assert
    expect(permission.can(editSecretAt("/app"))).toBe(true);
    expect(folderGrants.isEmpty).toBe(true);
  });

  test("should ignore a folder grant whose folder is gone", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    const { folderId } = await t.addFolderGrant(user, "/app", SecretFolderRole.Edit);
    t.folderLocationStore.folders.delete(folderId);

    // Action
    const { permission, folderGrants } = await t.service.getSecretsPermission({
      actor: t.actor(user),
      projectId: t.projectId
    });

    // Assert
    expect(permission.can(editSecretAt("/app"))).toBe(false);
    expect(folderGrants.isEmpty).toBe(true);
  });

  test("should refuse the request when a folder grant holds an unknown role", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    const { privilegeId } = await t.addFolderGrant(user, "/app", "superuser");

    // Action
    const result = t.service.getSecretsPermission({ actor: t.actor(user), projectId: t.projectId });

    // Assert
    await expect(result).rejects.toThrow(EntityNotFoundError);
    await expect(result).rejects.toMatchObject({
      name: "FolderRoleInvalid",
      message: `Folder access role 'superuser' on grant with ID '${privilegeId}' not found`
    });
  });

  test("should narrow folder grants too for a delegated OAuth token", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    await t.addFolderGrant(user, "/app", SecretFolderRole.Edit);
    const delegated: TPrincipal = { ...user, oauth: { clientId: "c", scopes: ["secrets:read"] } };

    // Action
    const { permission } = await t.service.getSecretsPermission({
      actor: t.actor(delegated),
      projectId: t.projectId
    });

    // Assert
    expect(permission.can(readSecretValueAt("/app"))).toBe(true);
    expect(permission.can(editSecretAt("/app"))).toBe(false);
  });

  test("should apply the folder grants of the actor whose privileges were assumed", async () => {
    // Setup
    const t = buildSecretsPermission();
    const requester = t.addUser();
    const assumed = t.addUser("assumed");
    await t.addProjectRole(requester, ProjectMembershipRole.Admin);
    await t.addProjectRole(assumed, ProjectMembershipRole.Viewer);
    await t.addFolderGrant(assumed, "/app", SecretFolderRole.Edit);
    const assuming: TPrincipal = {
      ...requester,
      assumed: { projectId: t.projectId, actorType: ActorType.USER, actorId: assumed.id, actorName: "assumed" }
    };

    // Action
    const { permission } = await t.service.getSecretsPermission({ actor: t.actor(assuming), projectId: t.projectId });

    // Assert
    expect(permission.can(editSecretAt("/app"))).toBe(true);
    expect(permission.can(editSecretAt("/other"))).toBe(false);
  });

  test("should keep serving a moved folder's old path until its folder grants are invalidated", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    const { folderId } = await t.addFolderGrant(user, "/old", SecretFolderRole.Edit);
    const get = () => t.service.getSecretsPermission({ actor: t.actor(user), projectId: t.projectId });
    await get();
    t.folderLocationStore.folders.set(folderId, {
      projectId: t.projectId,
      environmentSlug: "prod",
      secretPath: "/new"
    });

    // Action
    const beforeInvalidation = (await get()).permission;
    await t.service.invalidateFolderGrants({ projectIds: [t.projectId] });
    const afterInvalidation = (await get()).permission;

    // Assert
    expect(beforeInvalidation.can(editSecretAt("/old"))).toBe(true);
    expect(afterInvalidation.can(editSecretAt("/old"))).toBe(false);
    expect(afterInvalidation.can(editSecretAt("/new"))).toBe(true);
  });

  test("should refuse a project of another product", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    const kmsProjectId = t.addProject(ProjectType.KMS);
    await t.addProjectRole(user, ProjectMembershipRole.Admin, { inProjectId: kmsProjectId });

    // Action
    const result = t.service.getSecretsPermission({ actor: t.actor(user), projectId: kmsProjectId });

    // Assert
    await expect(result).rejects.toThrow(
      `The project is of type ${ProjectType.KMS}. Operations of type secret-manager are not allowed.`
    );
  });

  test("should give a service token the scopes it was issued with in its own project only", async () => {
    // Setup
    const t = buildSecretsPermission();
    const tokenId = randomUUID();
    t.serviceTokenStore.rows.set(tokenId, {
      id: tokenId,
      projectId: t.projectId,
      scopes: [{ environment: "prod", secretPath: "/app" }],
      permissions: ["read"]
    });
    const token: TPrincipal = { type: ActorType.SERVICE, id: tokenId, projectId: t.projectId };

    // Action
    const { permission, folderGrants } = await t.service.getSecretsPermission({
      actor: t.actor(token),
      projectId: t.projectId
    });
    const elsewhere = t.service.getSecretsPermission({ actor: t.actor(token), projectId: randomUUID() });

    // Assert
    await expect(elsewhere).rejects.toThrow(PermissionDeniedError);
    await expect(elsewhere).rejects.toThrow("Service token not a part of the specified project");
    expect(
      permission.can({ ...readSecretValueAt("/app"), action: ProjectPermissionSecretActions.DescribeAndReadValue })
    ).toBe(true);
    expect(permission.can(editSecretAt("/app"))).toBe(false);
    expect(folderGrants.isEmpty).toBe(true);
  });

  test("should refuse a service token that does not exist", async () => {
    // Setup
    const t = buildSecretsPermission();
    const tokenId = randomUUID();
    const token: TPrincipal = { type: ActorType.SERVICE, id: tokenId, projectId: t.projectId };

    // Action
    const result = t.service.getSecretsPermission({ actor: t.actor(token), projectId: t.projectId });

    // Assert
    await expect(result).rejects.toThrow(EntityNotFoundError);
    await expect(result).rejects.toThrow(`Service token with ID '${tokenId}' not found`);
  });
});

describe("SecretsPermissionService.getProjectPermissionWithFolderGrants", () => {
  test("should layer the actor's folder grants over its roles in a Secret Manager project", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Member);
    await t.addFolderGrant(user, "/app", SecretFolderRole.List);

    // Action
    const permission = await t.service.getProjectPermissionWithFolderGrants({
      actor: t.actor(user),
      projectId: t.projectId
    });

    // Assert
    expect(permission.can(readSecretValueAt("/app"))).toBe(false);
    expect(permission.can(readSecretValueAt("/other"))).toBe(true);
  });

  test("should give the project permission of a project of another product", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    const kmsProjectId = t.addProject(ProjectType.KMS);
    await t.addProjectRole(user, ProjectMembershipRole.Admin, { inProjectId: kmsProjectId });

    // Action
    const permission = await t.service.getProjectPermissionWithFolderGrants({
      actor: t.actor(user),
      projectId: kmsProjectId
    });

    // Assert
    expect(permission.hasRole({ slug: ProjectMembershipRole.Admin })).toBe(true);
  });

  test("should accept a service token whose project is of another product", async () => {
    // Setup
    const t = buildSecretsPermission();
    const tokenId = randomUUID();
    t.serviceTokenStore.rows.set(tokenId, {
      id: tokenId,
      projectId: t.projectId,
      scopes: [{ environment: "prod", secretPath: "/app" }],
      permissions: ["read"]
    });
    t.projectStore.rows.set(t.projectId, { ...t.projectStore.rows.get(t.projectId)!, type: ProjectType.KMS });
    const token: TPrincipal = { type: ActorType.SERVICE, id: tokenId, projectId: t.projectId };

    // Action
    const result = t.service.getProjectPermissionWithFolderGrants({ actor: t.actor(token), projectId: t.projectId });

    // Assert
    await expect(result).resolves.toBeDefined();
  });
});

describe("SecretsPermissionService.getPermissionFingerprint", () => {
  test("should change when the project's folder grants are invalidated", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    const input = { actor: { type: ActorType.USER as const, id: user.id }, orgId: t.orgId, projectId: t.projectId };
    const before = await t.service.getPermissionFingerprint(input);

    // Action
    await t.service.invalidateFolderGrants({ projectIds: [t.projectId, t.projectId, ""] });

    // Assert
    const after = await t.service.getPermissionFingerprint(input);
    expect(after).not.toEqual(before);
    expect(after.endsWith(":1")).toBe(true);
  });
});

describe("SecretsPermissionService.getPermissionFingerprint folder version", () => {
  test("should read a project whose folder grants were never invalidated as version zero", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);

    // Action
    const fingerprint = await t.service.getPermissionFingerprint({
      actor: { type: ActorType.USER, id: user.id },
      orgId: t.orgId,
      projectId: t.projectId
    });

    // Assert
    expect(fingerprint.endsWith(":0")).toBe(true);
  });
});

describe("SecretsPermissionService.getPermissionCacheFingerprint", () => {
  test("should change when the actor's roles change or the project's folder grants are invalidated", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    const input = { actor: { type: ActorType.USER as const, id: user.id }, orgId: t.orgId, projectId: t.projectId };
    const first = await t.service.getPermissionCacheFingerprint(input);

    // Action
    await t.addProjectRole(user, ProjectMembershipRole.Member);
    const afterRole = await t.service.getPermissionCacheFingerprint(input);
    await t.service.invalidateFolderGrants({ projectIds: [t.projectId] });
    const afterFolders = await t.service.getPermissionCacheFingerprint(input);

    // Assert
    expect(new Set([first, afterRole, afterFolders]).size).toBe(3);
    expect(afterFolders.endsWith(":1")).toBe(true);
  });
});

describe("SecretsPermissionService.getProjectMemberPermissions", () => {
  const customRole = (t: ReturnType<typeof buildSecretsPermission>, rules: TRule[]) =>
    t.accessControl.seed.role({
      owner: { projectId: t.projectId },
      slug: `role-${randomUUID()}`,
      permissions: packRules(rules)
    });

  const groupWithRole = async (
    t: ReturnType<typeof buildSecretsPermission>,
    role: { role: string; customRoleId?: string }
  ) => {
    const group = await t.accessControl.seed.group({ orgId: t.orgId });
    await t.accessControl.seed.membership({
      scope: AccessScope.Project,
      orgId: t.orgId,
      projectId: t.projectId,
      actor: { groupId: group.id },
      roles: [role]
    });
    return group;
  };

  test("should apply a viewer's folder grants in its listed permission and list them by actor", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    await t.addFolderGrant(user, "/app", SecretFolderRole.Edit);
    await t.addFolderGrant(user, "/ended", SecretFolderRole.Edit, { ended: true });

    // Action
    const listing = await t.service.getProjectMemberPermissions({ orgId: t.orgId, projectId: t.projectId });

    // Assert
    const [listed] = listing.userPermissions;
    expect(listed.permission.can(editSecretAt("/app"))).toBe(true);
    expect(listed.permission.can(editSecretAt("/other"))).toBe(false);
    expect(listing.folderAccessByActorId.get(user.id)?.map((grant) => grant.secretPath)).toEqual(["/app"]);
  });

  test("should leave out ghost users", async () => {
    // Setup
    const t = buildSecretsPermission();
    const ghost = t.addUser();
    t.memberNameStore.users.set(ghost.id, { username: ghost.username, isGhost: true });
    await t.addProjectRole(ghost, ProjectMembershipRole.Viewer);

    // Action
    const listing = await t.service.getProjectMemberPermissions({ orgId: t.orgId, projectId: t.projectId });

    // Assert
    expect(listing.userPermissions).toEqual([]);
  });

  test("should not merge a ghost user's direct membership into its permission", async () => {
    // Setup
    const t = buildSecretsPermission();
    const ghost = t.addUser();
    t.memberNameStore.users.set(ghost.id, { username: ghost.username, isGhost: true });
    await t.addProjectRole(ghost, ProjectMembershipRole.Admin);

    // Action
    const listing = await t.service.getProjectMemberPermissions({ orgId: t.orgId, projectId: t.projectId });

    // Assert
    expect(listing.permissionForActor({ actorId: ghost.id, groupIds: [] }).can(editSecretAt("/app"))).toBe(false);
  });

  test("should list nobody for a project that does not exist", async () => {
    // Setup
    const t = buildSecretsPermission();

    // Action
    const listing = await t.service.getProjectMemberPermissions({ orgId: t.orgId, projectId: randomUUID() });

    // Assert
    expect(listing.userPermissions).toEqual([]);
    expect(listing.folderAccessByActorId.size).toBe(0);
  });

  test("should let a group's deny hold against an allow from the direct membership", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser("alice");
    const allowProd = await customRole(t, [
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { environment: "prod" }
      } as TRule
    ]);
    const denyPayments = await customRole(t, [
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { environment: "prod", secretPath: "/payments" },
        inverted: true
      } as TRule
    ]);
    await t.accessControl.seed.membership({
      scope: AccessScope.Project,
      orgId: t.orgId,
      projectId: t.projectId,
      actor: { userId: user.id },
      roles: [{ role: ProjectMembershipRole.Custom, customRoleId: allowProd.id }]
    });
    const group = await groupWithRole(t, { role: ProjectMembershipRole.Custom, customRoleId: denyPayments.id });

    // Action
    const listing = await t.service.getProjectMemberPermissions({ orgId: t.orgId, projectId: t.projectId });

    // Assert
    const merged = listing.permissionForActor({ actorId: user.id, groupIds: [group.id] });
    expect(merged.can(readSecretValueAt("/payments"))).toBe(false);
    expect(merged.can(readSecretValueAt("/api"))).toBe(true);
  });

  test("should fill a group role's placeholder with the person's own username", async () => {
    // Setup
    const t = buildSecretsPermission();
    const perUser = await customRole(t, [
      {
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: { environment: "prod", secretPath: "/users/{{identity.username}}" }
      } as TRule
    ]);
    const group = await groupWithRole(t, { role: ProjectMembershipRole.Custom, customRoleId: perUser.id });

    // Action
    const listing = await t.service.getProjectMemberPermissions({ orgId: t.orgId, projectId: t.projectId });

    // Assert
    const bob = listing.permissionForActor({ actorId: randomUUID(), groupIds: [group.id], username: "bob" });
    expect(bob.can(readSecretValueAt("/users/bob"))).toBe(true);
    expect(bob.can(readSecretValueAt("/users/alice"))).toBe(false);
    expect(listing.groupRulesHavePlaceholders).toBe(true);
  });

  test("should leave out folder grants when any of the person's memberships holds the admin role", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser("carol");
    await t.addProjectRole(user, ProjectMembershipRole.Member);
    await t.addFolderGrant(user, "/api", SecretFolderRole.List);
    const admins = await groupWithRole(t, { role: ProjectMembershipRole.Admin });

    // Action
    const listing = await t.service.getProjectMemberPermissions({ orgId: t.orgId, projectId: t.projectId });

    // Assert
    expect(listing.permissionForActor({ actorId: user.id, groupIds: [] }).can(readSecretValueAt("/api"))).toBe(false);
    expect(listing.permissionForActor({ actorId: user.id, groupIds: [admins.id] }).can(readSecretValueAt("/api"))).toBe(
      true
    );
  });

  test("should read no folder grants outside a Secret Manager project", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    const kmsProjectId = t.addProject(ProjectType.KMS);
    await t.addProjectRole(user, ProjectMembershipRole.Viewer, { inProjectId: kmsProjectId });

    // Action
    const listing = await t.service.getProjectMemberPermissions({ orgId: t.orgId, projectId: kmsProjectId });

    // Assert
    expect(listing.folderAccessByActorId.size).toBe(0);
    expect(listing.userPermissions.map(({ id }) => id)).toEqual([user.id]);
  });
});

describe("SecretsPermissionService.getFolderGrantAuditSources", () => {
  const grantsOf = (t: ReturnType<typeof buildSecretsPermission>, userId: string) =>
    t.accessControl.actorGrantsService.getActorGrants({
      actor: { type: ActorType.USER, id: userId },
      scope: { scope: AccessScope.Project, orgId: t.orgId, projectId: t.projectId }
    });

  test("should list each active folder grant as an additional privilege source", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    const { privilegeId } = await t.addFolderGrant(user, "/app", SecretFolderRole.Read);
    await t.addFolderGrant(user, "/ended", SecretFolderRole.Read, { ended: true });

    // Action
    const sources = await t.service.getFolderGrantAuditSources({
      target: { type: ActorType.USER, id: user.id },
      projectId: t.projectId,
      grants: await grantsOf(t, user.id)
    });

    // Assert
    expect(sources.map(({ id, type }) => ({ id, type }))).toEqual([{ id: privilegeId, type: "additional_privilege" }]);
  });

  test("should list none for a built-in admin", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Admin);
    await t.addFolderGrant(user, "/app", SecretFolderRole.Read);

    // Action
    const sources = await t.service.getFolderGrantAuditSources({
      target: { type: ActorType.USER, id: user.id },
      projectId: t.projectId,
      grants: await grantsOf(t, user.id)
    });

    // Assert
    expect(sources).toEqual([]);
  });

  test("should list none outside a Secret Manager project", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    await t.addFolderGrant(user, "/app", SecretFolderRole.Read);
    t.projectStore.rows.set(t.projectId, { ...t.projectStore.rows.get(t.projectId)!, type: ProjectType.KMS });

    // Action
    const sources = await t.service.getFolderGrantAuditSources({
      target: { type: ActorType.USER, id: user.id },
      projectId: t.projectId,
      grants: await grantsOf(t, user.id)
    });

    // Assert
    expect(sources).toEqual([]);
  });
});

describe("SecretsPermissionService.getFolderGrantPermissions", () => {
  test("should give each active folder grant's allows only", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Viewer);
    await t.addFolderGrant(user, "/app", SecretFolderRole.Edit);
    const grants = await t.accessControl.actorGrantsService.getActorGrants({
      actor: { type: ActorType.USER, id: user.id },
      scope: { scope: AccessScope.Project, orgId: t.orgId, projectId: t.projectId }
    });

    // Action
    const permissions = await t.service.getFolderGrantPermissions({
      target: { type: ActorType.USER, id: user.id },
      projectId: t.projectId,
      grants
    });

    // Assert
    expect(permissions).toHaveLength(1);
    expect(permissions[0].can(editSecretAt("/app"))).toBe(true);
    expect(permissions[0].rules.some((rule) => rule.inverted)).toBe(false);
  });

  const permissionsOf = async (t: ReturnType<typeof buildSecretsPermission>, userId: string) => {
    const grants = await t.accessControl.actorGrantsService.getActorGrants({
      actor: { type: ActorType.USER, id: userId },
      scope: { scope: AccessScope.Project, orgId: t.orgId, projectId: t.projectId }
    });
    return t.service.getFolderGrantPermissions({
      target: { type: ActorType.USER, id: userId },
      projectId: t.projectId,
      grants
    });
  };

  test("should leave out a folder grant that has ended", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.NoAccess);
    await t.addFolderGrant(user, "/ended", SecretFolderRole.Edit, { ended: true });

    // Action
    const permissions = await permissionsOf(t, user.id);

    // Assert
    expect(permissions).toEqual([]);
  });

  test("should give a built-in admin none", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.Admin);
    await t.addFolderGrant(user, "/app", SecretFolderRole.Edit);

    // Action
    const permissions = await permissionsOf(t, user.id);

    // Assert
    expect(permissions).toEqual([]);
  });

  test("should give none outside a Secret Manager project", async () => {
    // Setup
    const t = buildSecretsPermission();
    const user = t.addUser();
    await t.addProjectRole(user, ProjectMembershipRole.NoAccess);
    await t.addFolderGrant(user, "/app", SecretFolderRole.Edit);
    t.projectStore.rows.set(t.projectId, { ...t.projectStore.rows.get(t.projectId)!, type: ProjectType.KMS });

    // Action
    const permissions = await permissionsOf(t, user.id);

    // Assert
    expect(permissions).toEqual([]);
  });

  test("should reach the folders below a folder grant that applies to subfolders", async () => {
    // Setup
    const abilityAt = async (appliesToSubfolders: boolean) => {
      const t = buildSecretsPermission();
      const user = t.addUser();
      await t.addProjectRole(user, ProjectMembershipRole.NoAccess);
      const { privilegeId } = await t.addFolderGrant(user, "/", SecretFolderRole.Read);
      const row = t.accessControl.grantStore.rows.privileges.get(privilegeId)!;
      t.accessControl.grantStore.rows.privileges.set(privilegeId, { ...row, appliesToSubfolders });
      const [permission] = await permissionsOf(t, user.id);
      return permission.can(readSecretValueAt("/app/deeper"));
    };

    // Action
    const recursive = await abilityAt(true);
    const exact = await abilityAt(false);

    // Assert
    expect(recursive).toBe(true);
    expect(exact).toBe(false);
  });
});
