import { randomUUID } from "node:crypto";

import { AccessScope, ProjectMembershipRole, ProjectType, SecretFolderRole } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { InMemoryKeyStore } from "@app/domains/lib/testing/in-memory-key-store";
import { buildAccessControlForTests } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { buildProjectsForTests } from "@app/domains/platform/projects/ce/testing/build-projects";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";

import { TFolderLocation } from "../data-access/folder-path-data-access";
import { TServiceTokenGrant } from "../data-access/service-token-data-access";
import { SecretsPermissionService } from "./secrets-permission";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const editSecretAt = (secretPath: string) => ({
  action: ProjectPermissionSecretActions.Edit,
  subject: ProjectPermissionSub.Secrets,
  fields: { environment: "prod", secretPath }
});
const readSecretValueAt = (secretPath: string) => ({
  action: ProjectPermissionSecretActions.ReadValue,
  subject: ProjectPermissionSub.Secrets,
  fields: { environment: "prod", secretPath }
});

const setup = () => {
  const { service: accessControlDomain, inMemory } = buildAccessControlForTests();
  const orgId = randomUUID();
  const projectId = randomUUID();
  const userId = randomUUID();
  const { service: projectsDomain } = buildProjectsForTests({
    accessControlDomain,
    organizationsDomain: { getOrgPermission: async () => ({}) as never },
    projects: [{ id: projectId, orgId, type: ProjectType.SecretManager }]
  });
  const locations = new Map<string, TFolderLocation>();
  const serviceTokens = new Map<string, TServiceTokenGrant>();
  const service = new SecretsPermissionService({
    projectsDomain,
    accessControlDomain,
    keyStore: new InMemoryKeyStore(),
    folderPaths: { findLocations: async (_projectId, folderIds) => folderIds.map((id) => locations.get(id)) },
    serviceTokens: { findById: async (id) => serviceTokens.get(id) }
  });
  const { transactionRunner } = inMemory!;
  const user: TPrincipal = {
    type: ActorType.USER,
    id: userId,
    username: "u",
    email: null,
    authMethod: AuthMethod.EMAIL,
    isSuperAdmin: false
  };
  const actor = (principal: TPrincipal = user): TActorContext => ({
    principal,
    org: {
      id: orgId,
      name: "o",
      rootOrgId: orgId,
      parentOrgId: orgId,
      shouldUseNewPrivilegeSystem: true,
      ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
    },
    plan: async () => {
      throw new Error("not needed");
    }
  });
  const addProjectRole = (role: string) =>
    transactionRunner.run(({ dataAccess }) =>
      dataAccess.memberships.create({
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        actorUserId: userId,
        roles: [{ role }]
      })
    );
  const addFolderGrant = async (secretPath: string, role: SecretFolderRole, temporaryAccessEndTime?: Date) => {
    const folderId = randomUUID();
    locations.set(folderId, { environmentSlug: "prod", path: secretPath });
    await transactionRunner.run(({ dataAccess }) =>
      dataAccess.privileges.create({
        name: `grant-${folderId}`,
        actorUserId: userId,
        projectId,
        folderId,
        role,
        ...(temporaryAccessEndTime
          ? {
              isTemporary: true,
              temporaryMode: "relative",
              temporaryRange: "1h",
              temporaryAccessStartTime: new Date(0),
              temporaryAccessEndTime
            }
          : {})
      })
    );
    return folderId;
  };
  return { service, actor, user, addProjectRole, addFolderGrant, locations, serviceTokens, projectId };
};

describe("SecretsPermissionService.getSecretsPermission", () => {
  test("should let a viewer edit secrets in a folder it was granted edit on, and nowhere else", async () => {
    // Setup
    const { service, actor, addProjectRole, addFolderGrant, projectId } = setup();
    await addProjectRole(ProjectMembershipRole.Viewer);
    await addFolderGrant("/app", SecretFolderRole.Edit);

    // Action
    const { permission, folderGrants } = await service.getSecretsPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(editSecretAt("/app"))).toBe(true);
    expect(permission.can(editSecretAt("/other"))).toBe(false);
    expect(folderGrants.map((grant) => grant.secretPath)).toEqual(["/app"]);
  });

  test("should drop a temporary folder grant that has ended", async () => {
    // Setup
    const { service, actor, addProjectRole, addFolderGrant, projectId } = setup();
    await addProjectRole(ProjectMembershipRole.Viewer);
    await addFolderGrant("/ended", SecretFolderRole.Edit, new Date(Date.now() - 1000));

    // Action
    const { permission } = await service.getSecretsPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(editSecretAt("/ended"))).toBe(false);
  });

  test("should never let a folder grant restrict a built-in admin", async () => {
    // Setup
    const { service, actor, addProjectRole, addFolderGrant, projectId } = setup();
    await addProjectRole(ProjectMembershipRole.Admin);
    await addFolderGrant("/app", SecretFolderRole.List);

    // Action
    const { permission, folderGrants } = await service.getSecretsPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(editSecretAt("/app"))).toBe(true);
    expect(folderGrants).toEqual([]);
  });

  test("should ignore a folder grant whose folder is gone", async () => {
    // Setup
    const { service, actor, addProjectRole, addFolderGrant, locations, projectId } = setup();
    await addProjectRole(ProjectMembershipRole.Viewer);
    const folderId = await addFolderGrant("/app", SecretFolderRole.Edit);
    locations.delete(folderId);

    // Action
    const { permission, folderGrants } = await service.getSecretsPermission({ actor: actor(), projectId });

    // Assert
    expect(permission.can(editSecretAt("/app"))).toBe(false);
    expect(folderGrants).toEqual([]);
  });

  test("should narrow folder grants too for a delegated OAuth token", async () => {
    // Setup
    const { service, actor, user, addProjectRole, addFolderGrant, projectId } = setup();
    await addProjectRole(ProjectMembershipRole.Viewer);
    await addFolderGrant("/app", SecretFolderRole.Edit);
    const delegated = { ...user, oauth: { clientId: "c", scopes: ["secrets:read"] } } as TPrincipal;

    // Action
    const { permission } = await service.getSecretsPermission({ actor: actor(delegated), projectId });

    // Assert
    expect(permission.can(readSecretValueAt("/app"))).toBe(true);
    expect(permission.can(editSecretAt("/app"))).toBe(false);
  });

  test("should give a service token the scopes it was issued with in its own project only", async () => {
    // Setup
    const { service, actor, serviceTokens, projectId } = setup();
    const tokenId = randomUUID();
    serviceTokens.set(tokenId, {
      id: tokenId,
      projectId,
      scopes: [{ environment: "prod", secretPath: "/app" }],
      permissions: ["read"]
    });
    const token: TPrincipal = { type: ActorType.SERVICE, id: tokenId, projectId };

    // Action
    const { permission } = await service.getSecretsPermission({ actor: actor(token), projectId });
    const elsewhere = service.getSecretsPermission({ actor: actor(token), projectId: randomUUID() });

    // Assert
    await expect(elsewhere).rejects.toThrow("Service token not a part of the specified project");
    // Service tokens grant the original combined read action.
    expect(
      permission.can({ ...readSecretValueAt("/app"), action: ProjectPermissionSecretActions.DescribeAndReadValue })
    ).toBe(true);
    expect(permission.can(editSecretAt("/app"))).toBe(false);
  });
});
