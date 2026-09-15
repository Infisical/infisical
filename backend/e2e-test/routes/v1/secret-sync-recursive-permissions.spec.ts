import { randomUUID } from "node:crypto";

import { createFolder } from "e2e-test/testUtils/folders";
import {
  createAwsAppConnection,
  createSecretSync,
  deleteAppConnection,
  deleteSecretSync
} from "e2e-test/testUtils/secret-syncs";
import { createSecretV2 } from "e2e-test/testUtils/secrets";
import jwt from "jsonwebtoken";

import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  SecretFolderRole,
  TableName
} from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { SecretSyncInitialSyncBehavior } from "@app/services/secret-sync/secret-sync-enums";

// The sync worker reads every folder a sync covers with authorization disabled
// (canExpandValue and hasSecretAccess both return true), so create and update are the only
// gate. A folder grant is what makes the escalation reachable: it can give an actor read on a
// parent folder while the base project role denies every child.

const ENV = "dev";
const REGION = "us-east-1";
const ORG_ID = seedData1.organization.id;

const adminHeaders = { authorization: `Bearer ${jwtAuthToken}` };

describe("A secret sync is refused when it would read a folder the actor cannot", async () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  let projectId: string;
  let connectionId: string;
  let actorUserId: string;
  let actorJwt: string;
  const actorSessionId = randomUUID();
  const createdSyncIds: string[] = [];

  const newSync = async (dto: { name: string; recursive: boolean; expectStatusCode?: number }) => {
    const result = await createSecretSync({
      name: dto.name,
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: "/backend",
      region: REGION,
      destinationPath: `/${dto.name}/`,
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      recursive: dto.recursive,
      isAutoSyncEnabled: false,
      authToken: actorJwt,
      expectStatusCode: dto.expectStatusCode
    });

    if (result.secretSync) createdSyncIds.push(result.secretSync.id);

    return result;
  };

  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);

    const suffix = randomUUID().slice(0, 8);

    const projectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders,
      body: { projectName: `secret-sync-recursive-perms-${suffix}` }
    });
    expect(projectRes.statusCode).toBe(200);
    projectId = projectRes.json().project.id as string;

    connectionId = await createAwsAppConnection({
      name: `secret-sync-recursive-perms-${suffix}`,
      authToken: jwtAuthToken
    });

    await createFolder({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      name: "backend"
    });
    await createFolder({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/backend",
      name: "api"
    });

    await createSecretV2({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/backend",
      key: "BACKEND_KEY",
      value: "backend-value"
    });
    await createSecretV2({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/backend/api",
      key: "API_KEY",
      value: "api-value"
    });

    const username = `sync-recursive-perms-${alphaNumericNanoId(8)}@example.com`.toLowerCase();
    const [user] = await testDb(TableName.Users)
      .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
      .returning("*");
    actorUserId = user.id;

    const [orgMembership] = await testDb(TableName.Membership)
      .insert({
        scope: AccessScope.Organization,
        scopeOrgId: ORG_ID,
        actorUserId,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({ membershipId: orgMembership.id, role: OrgMembershipRole.Member });

    const [projectMembership] = await testDb(TableName.Membership)
      .insert({
        scope: AccessScope.Project,
        scopeOrgId: ORG_ID,
        scopeProjectId: projectId,
        actorUserId
      })
      .returning("*");
    // The base role grants nothing, so every folder the grant below does not name is denied.
    await testDb(TableName.MembershipRole).insert({
      membershipId: projectMembership.id,
      role: ProjectMembershipRole.NoAccess
    });

    await testDb(TableName.AuthTokenSession).insert({
      id: actorSessionId,
      userId: actorUserId,
      ip: "127.0.0.1",
      userAgent: "e2e-secret-sync-recursive-perms",
      accessVersion: 1,
      refreshVersion: 1,
      lastUsed: new Date()
    } as never);

    actorJwt = jwt.sign(
      {
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: actorUserId,
        tokenVersionId: actorSessionId,
        authMethod: AuthMethod.EMAIL,
        organizationId: ORG_ID,
        accessVersion: 1
      },
      getConfig().AUTH_SECRET,
      { expiresIn: 3600 }
    );

    // Manage is the lowest tier carrying secret sync create, and a folder grant applies to the
    // named folder only, so "/backend/api" falls back to the no-access base role.
    const grantRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/users/${actorUserId}/secret-folder-access`,
      headers: adminHeaders,
      body: { environmentSlug: ENV, secretPath: "/backend", permission: SecretFolderRole.Manage }
    });
    expect(grantRes.statusCode).toBe(200);
  });

  afterAll(async () => {
    for (const syncId of createdSyncIds) {
      // eslint-disable-next-line no-await-in-loop
      await deleteSecretSync({ syncId, authToken: jwtAuthToken });
    }

    await deleteAppConnection({ connectionId, authToken: jwtAuthToken });
    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: adminHeaders
    });

    await testDb(TableName.AuthTokenSession).where({ id: actorSessionId }).del();
    await testDb(TableName.Membership).where({ actorUserId }).del();
    await testDb(TableName.Users).where({ id: actorUserId }).del();
  });

  test("creating a sync that includes subfolders is refused, naming the folder that is denied", async () => {
    const { error } = await newSync({ name: "recursive-denied", recursive: true, expectStatusCode: 403 });

    expect(error.message).toContain("/backend/api");
    expect(error.message).toContain(ENV);
  });

  test("creating the same sync without subfolders succeeds", async () => {
    const { secretSync } = await newSync({ name: "non-recursive-allowed", recursive: false });

    expect(secretSync).toEqual(expect.objectContaining({ name: "non-recursive-allowed" }));
  });

  test("repointing an existing recursive sync at another destination is refused", async () => {
    // The admin can read the whole subtree, so this sync is legitimate at the moment it is made.
    // The Manage grant then gives the actor Edit on it, scoped to "/backend", while leaving
    // "/backend/api" denied. Without a check on this path the actor sends the denied folder to a
    // destination of their choosing without ever touching the sync's source.
    const { secretSync } = await createSecretSync({
      name: "recursive-created-by-admin",
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: "/backend",
      region: REGION,
      destinationPath: "/recursive-created-by-admin/",
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      recursive: true,
      isAutoSyncEnabled: false,
      authToken: jwtAuthToken
    });
    createdSyncIds.push(secretSync!.id);

    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/secret-syncs/aws-parameter-store/${secretSync!.id}`,
      headers: { authorization: `Bearer ${actorJwt}` },
      body: { destinationConfig: { region: REGION, path: "/actor-controlled/" } }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain("/backend/api");
  });

  test("turning subfolders on for an existing sync is refused", async () => {
    const { secretSync } = await newSync({ name: "recursive-turned-on-later", recursive: false });

    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/secret-syncs/aws-parameter-store/${secretSync!.id}`,
      headers: { authorization: `Bearer ${actorJwt}` },
      body: {
        syncOptions: {
          initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
          recursive: true
        }
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain("/backend/api");
  });
});
