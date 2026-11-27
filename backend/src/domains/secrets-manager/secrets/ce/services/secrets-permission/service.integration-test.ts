import { randomUUID } from "node:crypto";

import { AccessScope, ProjectMembershipRole, SecretFolderRole, TableName } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { setupIntegration, TTenant } from "@app/domains/lib/testing/integration";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";
import { KnexGrantSeeder } from "@app/domains/platform/access-control/ce/testing/knex-grant-seeder";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { buildProjectsModule } from "@app/domains/platform/projects/ce/testing/projects-module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";

import { SecretsModule } from "../../module";

const editSecretAt = (secretPath: string) => ({
  action: ProjectPermissionSecretActions.Edit,
  subject: ProjectPermissionSub.Secrets,
  fields: { environment: "prod", secretPath }
});

describe("SecretsPermissionService.getSecretsPermission", () => {
  const h = setupIntegration();

  const build = () =>
    new SecretsModule({
      db: h.db,
      keyStore: new InMemoryKeyStore(),
      ...accessControlServices(h.db),
      projectPermissionService: buildProjectsModule(h.db).projectPermissionService,
      projectsService: buildProjectsModule(h.db).projectsService,
      cacheMarkerTtlSeconds: 0
    }).secretsPermissionService;

  const actorIn = (tenant: TTenant, principal: TPrincipal): TActorContext => ({
    principal,
    org: {
      id: tenant.org.id,
      name: tenant.org.name,
      rootOrgId: tenant.org.id,
      parentOrgId: tenant.org.id,
      shouldUseNewPrivilegeSystem: true,
      ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
    }
  });

  // No domain owns secret_folders yet, so write the rows directly.
  const addFolder = async (tenant: TTenant, name: string) => {
    const prod = tenant.environments.find((env) => env.slug === "prod")!;
    const [root] = await h.db(TableName.SecretFolder).insert({ name: "root", envId: prod.id }).returning("*");
    const [folder] = await h
      .db(TableName.SecretFolder)
      .insert({ name, envId: prod.id, parentId: root.id })
      .returning("*");
    return folder;
  };

  test("should let a viewer edit secrets in the folder it was granted, read from Postgres", async () => {
    // Setup
    const tenant = await h.newTenant();
    const seed = new KnexGrantSeeder(h.db);
    const user = await h.factories.user();
    await seed.membership({
      scope: AccessScope.Project,
      orgId: tenant.org.id,
      projectId: tenant.project.id,
      actor: { userId: user.id },
      roles: [{ role: ProjectMembershipRole.Viewer }]
    });
    const folder = await addFolder(tenant, "app");
    await seed.privilege({
      actor: { userId: user.id },
      projectId: tenant.project.id,
      folder: { id: folder.id, role: SecretFolderRole.Edit }
    });
    const principal: TPrincipal = {
      type: ActorType.USER,
      id: user.id,
      username: user.username,
      email: null,
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false
    };

    // Action
    const { permission, folderGrants } = await build().getSecretsPermission({
      actor: actorIn(tenant, principal),
      projectId: tenant.project.id
    });

    // Assert
    expect(permission.can(editSecretAt("/app"))).toBe(true);
    expect(permission.can(editSecretAt("/"))).toBe(false);
    expect(folderGrants.list.map((grant) => grant.folderId)).toEqual([folder.id]);
  });

  test("should give a service token its scopes in its own project", async () => {
    // Setup
    const tenant = await h.newTenant();
    const [token] = await h
      .db(TableName.ServiceToken)
      .insert({
        name: "token",
        scopes: JSON.stringify([{ environment: "prod", secretPath: "/app" }]),
        permissions: ["read", "write"],
        secretHash: randomUUID(),
        createdBy: tenant.admin.id,
        projectId: tenant.project.id
      })
      .returning("*");
    const principal: TPrincipal = { type: ActorType.SERVICE, id: token.id, projectId: tenant.project.id };

    // Action
    const { permission } = await build().getSecretsPermission({
      actor: actorIn(tenant, principal),
      projectId: tenant.project.id
    });

    // Assert
    expect(permission.can(editSecretAt("/app"))).toBe(true);
    expect(permission.can(editSecretAt("/other"))).toBe(false);
  });
});

describe("SecretsPermissionService.getProjectMemberPermissions", () => {
  const h = setupIntegration();

  test("should list direct members by name, leaving out ghost users", async () => {
    // Setup
    const tenant = await h.newTenant();
    const ghost = await h.factories.user({ isGhost: true });
    await h.factories.projectMembership({ orgId: tenant.org.id, projectId: tenant.project.id, userId: ghost.id });
    const service = new SecretsModule({
      db: h.db,
      keyStore: new InMemoryKeyStore(),
      ...accessControlServices(h.db),
      projectPermissionService: buildProjectsModule(h.db).projectPermissionService,
      projectsService: buildProjectsModule(h.db).projectsService,
      cacheMarkerTtlSeconds: 0
    }).secretsPermissionService;

    // Action
    const listing = await service.getProjectMemberPermissions({ orgId: tenant.org.id, projectId: tenant.project.id });

    // Assert
    expect(listing.userPermissions.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: tenant.admin.id, name: tenant.admin.username }
    ]);
  });
});
