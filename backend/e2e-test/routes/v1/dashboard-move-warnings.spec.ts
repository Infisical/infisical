import { randomUUID } from "node:crypto";

import { createAwsAppConnection } from "e2e-test/testUtils/app-connections";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createFolder } from "e2e-test/testUtils/folders";
import { createSecretSync } from "e2e-test/testUtils/secret-syncs";
import jwt from "jsonwebtoken";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

const ENV = "dev";
const REGION = "us-east-1";

type TMoveWarningSecretSync = {
  id: string | null;
  name: string | null;
  destination: string | null;
  secretPath: string | null;
  includeAllSubFolders: boolean | null;
  isAutoSyncEnabled: boolean | null;
};

describe("Move warnings", async () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  let orgId: string;
  let projectId: string;
  let adminToken: string;
  let cleanupOrg: () => Promise<void>;
  let noAccessUserId: string;
  let noAccessToken: string;

  const getMoveWarnings = async (
    query: {
      sourceEnvironment?: string;
      sourceSecretPath: string;
      destinationEnvironment?: string;
      destinationSecretPath: string;
    },
    authToken = adminToken
  ) => {
    const res = await testServer.inject({
      method: "GET",
      url: "/api/v1/dashboard/move-warnings",
      headers: { authorization: `Bearer ${authToken}` },
      query: {
        projectId,
        sourceEnvironment: query.sourceEnvironment ?? ENV,
        destinationEnvironment: query.destinationEnvironment ?? ENV,
        sourceSecretPath: query.sourceSecretPath,
        destinationSecretPath: query.destinationSecretPath
      }
    });

    return res;
  };

  const syncNames = async (query: Parameters<typeof getMoveWarnings>[0]) => {
    const res = await getMoveWarnings(query);
    expect(res.statusCode).toBe(200);
    return (res.json().secretSyncs as TMoveWarningSecretSync[]).map((sync) => sync.name);
  };

  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);

    ({
      orgId,
      projectId,
      authToken: adminToken,
      cleanup: cleanupOrg
    } = await createIsolatedOrgAndProject("move-warnings"));

    const connectionId = await createAwsAppConnection({
      name: `move-warnings-${randomUUID().slice(0, 8)}`,
      authToken: adminToken
    });

    for (const folder of [
      { secretPath: "/", name: "apps" },
      { secretPath: "/apps", name: "payments" },
      { secretPath: "/", name: "flat" },
      { secretPath: "/", name: "unsynced" }
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await createFolder({ authToken: adminToken, workspaceId: projectId, environmentSlug: ENV, ...folder });
    }

    for (const sync of [
      { name: "apps-recursive", secretPath: "/apps", includeAllSubFolders: true },
      { name: "flat-only", secretPath: "/flat", includeAllSubFolders: false }
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await createSecretSync({
        ...sync,
        projectId,
        connectionId,
        environmentSlug: ENV,
        region: REGION,
        destinationPath: `/${sync.name}/`,
        authToken: adminToken
      });
    }

    const username = `move-warnings-${alphaNumericNanoId(8)}@example.com`.toLowerCase();
    const [user] = await testDb(TableName.Users)
      .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
      .returning("*");
    noAccessUserId = user.id;

    const [orgMembership] = await testDb(TableName.Membership)
      .insert({
        scope: AccessScope.Organization,
        scopeOrgId: orgId,
        actorUserId: noAccessUserId,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({ membershipId: orgMembership.id, role: OrgMembershipRole.Member });

    const [projectMembership] = await testDb(TableName.Membership)
      .insert({
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        actorUserId: noAccessUserId
      })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({
      membershipId: projectMembership.id,
      role: ProjectMembershipRole.NoAccess
    });

    const sessionId = randomUUID();
    await testDb(TableName.AuthTokenSession).insert({
      id: sessionId,
      userId: noAccessUserId,
      ip: "127.0.0.1",
      userAgent: "e2e-move-warnings",
      accessVersion: 1,
      refreshVersion: 1,
      lastUsed: new Date()
    } as never);

    noAccessToken = jwt.sign(
      {
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: noAccessUserId,
        tokenVersionId: sessionId,
        authMethod: AuthMethod.EMAIL,
        organizationId: orgId,
        accessVersion: 1
      },
      getConfig().AUTH_SECRET,
      { expiresIn: 3600 }
    );
  });

  afterAll(async () => {
    await cleanupOrg();
    await testDb(TableName.AuthTokenSession).where({ userId: noAccessUserId }).del();
    await testDb(TableName.Users).where({ id: noAccessUserId }).del();
  });

  test("lists a recursive sync above the destination", async () => {
    expect(await syncNames({ sourceSecretPath: "/", destinationSecretPath: "/apps/payments" })).toEqual([
      "apps-recursive"
    ]);
  });

  test("returns the sync's details", async () => {
    const res = await getMoveWarnings({ sourceSecretPath: "/", destinationSecretPath: "/apps" });

    expect(res.json().secretSyncs).toEqual([
      expect.objectContaining({
        name: "apps-recursive",
        destination: "aws-parameter-store",
        secretPath: "/apps",
        includeAllSubFolders: true,
        isAutoSyncEnabled: false
      })
    ]);
  });

  test("leaves out a sync that already covers the source", async () => {
    expect(await syncNames({ sourceSecretPath: "/apps", destinationSecretPath: "/apps/payments" })).toEqual([]);
  });

  test("lists a non-recursive sync on the destination itself", async () => {
    expect(await syncNames({ sourceSecretPath: "/", destinationSecretPath: "/flat" })).toEqual(["flat-only"]);
  });

  test("does not list a non-recursive sync for a folder moved beneath it", async () => {
    // A folder lands at the destination plus its own name, which the non-recursive sync never reads.
    expect(await syncNames({ sourceSecretPath: "/unsynced", destinationSecretPath: "/flat/unsynced" })).toEqual([]);
  });

  test("lists a recursive sync for a folder moved beneath it", async () => {
    expect(await syncNames({ sourceSecretPath: "/unsynced", destinationSecretPath: "/apps/unsynced" })).toEqual([
      "apps-recursive"
    ]);
  });

  test("returns nothing for an unsynced destination", async () => {
    expect(await syncNames({ sourceSecretPath: "/apps", destinationSecretPath: "/unsynced" })).toEqual([]);
  });

  test("withholds the details of a sync the actor cannot read", async () => {
    const res = await getMoveWarnings({ sourceSecretPath: "/", destinationSecretPath: "/apps" }, noAccessToken);

    expect(res.statusCode).toBe(200);
    expect(res.json().secretSyncs).toEqual([
      {
        id: null,
        name: null,
        destination: null,
        secretPath: null,
        includeAllSubFolders: null,
        isAutoSyncEnabled: null
      }
    ]);
  });

  test("names an environment that does not exist", async () => {
    const res = await getMoveWarnings({
      sourceSecretPath: "/",
      destinationEnvironment: "missing-env",
      destinationSecretPath: "/"
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain('"missing-env"');
  });
});
