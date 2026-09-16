import { randomUUID } from "node:crypto";

import { createFolder } from "e2e-test/testUtils/folders";
import {
  createAwsAppConnection,
  createSecretSync,
  deleteAppConnection,
  deleteSecretSync
} from "e2e-test/testUtils/secret-syncs";
import { createSecretV2 } from "e2e-test/testUtils/secrets";

import { TableName } from "@app/db/schemas";
import { initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { SecretSyncInitialSyncBehavior } from "@app/services/secret-sync/secret-sync-enums";

// A destination that stores secrets in one flat list cannot hold the same name twice, so a
// recursive sync whose subtree reuses a name is broken from the moment it is saved. The
// job-time check still exists for the sync that only clashes later.

const ENV = "dev";
const REGION = "us-east-1";

const adminHeaders = { authorization: `Bearer ${jwtAuthToken}` };

describe("A recursive secret sync is refused when two folders use the same secret name", async () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  let projectId: string;
  let connectionId: string;
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
      authToken: jwtAuthToken,
      expectStatusCode: dto.expectStatusCode
    });

    if (result.secretSync) createdSyncIds.push(result.secretSync.id);

    return result;
  };

  // Creating a recursive sync over an existing collision is refused, so the only way a sync can be
  // holding one is for the second name to have appeared after it was saved. Every update test below
  // needs a sync in that state, so they all build it the same way.
  const recursiveSyncWithLateCollision = async (dto: { name: string; folder: string }) => {
    await createFolder({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      name: dto.folder
    });
    await createFolder({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: `/${dto.folder}`,
      name: "child"
    });

    const { secretSync } = await createSecretSync({
      name: dto.name,
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: `/${dto.folder}`,
      region: REGION,
      destinationPath: `/${dto.name}/`,
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      recursive: true,
      isAutoSyncEnabled: false,
      authToken: jwtAuthToken
    });
    createdSyncIds.push(secretSync!.id);

    for (const secretPath of [`/${dto.folder}`, `/${dto.folder}/child`]) {
      // eslint-disable-next-line no-await-in-loop
      await createSecretV2({
        authToken: jwtAuthToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath,
        key: "LATE_KEY",
        value: `value-for-${secretPath}`
      });
    }

    return secretSync!;
  };

  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);

    const suffix = randomUUID().slice(0, 8);

    const projectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders,
      body: { projectName: `secret-sync-recursive-dupes-${suffix}` }
    });
    expect(projectRes.statusCode).toBe(200);
    projectId = projectRes.json().project.id as string;

    connectionId = await createAwsAppConnection({
      name: `secret-sync-recursive-dupes-${suffix}`,
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
      key: "DB_URL",
      value: "postgres://backend"
    });
    await createSecretV2({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/backend/api",
      key: "DB_URL",
      value: "postgres://api"
    });
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
  });

  test("creating it is refused, naming the secret and both folders", async () => {
    const { error } = await newSync({ name: "recursive-duplicate", recursive: true, expectStatusCode: 400 });

    expect(error.message).toContain("DB_URL");
    expect(error.message).toContain("/backend");
    expect(error.message).toContain("/backend/api");
  });

  test("the refused request leaves no sync behind", async () => {
    const rows = await testDb(TableName.SecretSync).where({ projectId, name: "recursive-duplicate" });

    expect(rows).toHaveLength(0);
  });

  test("creating the same sync without subfolders succeeds", async () => {
    const { secretSync } = await newSync({ name: "non-recursive-duplicate", recursive: false });

    expect(secretSync).toEqual(expect.objectContaining({ name: "non-recursive-duplicate" }));
  });

  // Both tests below pin the same rule from opposite sides: the checks read the options the update
  // is about to store. Reading the request alone misses that an absent syncOptions leaves the stored
  // ones in place; reading the stored row alone misses that a supplied syncOptions replaces them.

  test("turning subfolders off is allowed even though the subtree collides", async () => {
    const secretSync = await recursiveSyncWithLateCollision({
      name: "recursive-turned-off-later",
      folder: "reports"
    });

    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/secret-syncs/aws-parameter-store/${secretSync.id}`,
      headers: adminHeaders,
      body: {
        syncOptions: {
          initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination
        }
      }
    });

    expect(res.statusCode).toBe(200);

    const [row] = await testDb(TableName.SecretSync).where({ id: secretSync.id });

    expect((row.syncOptions as { recursive?: boolean }).recursive).toBeFalsy();
  });

  test("an update that leaves the sync options alone is still checked as recursive", async () => {
    const secretSync = await recursiveSyncWithLateCollision({
      name: "recursive-left-alone",
      folder: "metrics"
    });

    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/secret-syncs/aws-parameter-store/${secretSync.id}`,
      headers: adminHeaders,
      body: { name: "recursive-left-alone-renamed" }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("LATE_KEY");
    expect(res.json().message).toContain("/metrics");
    expect(res.json().message).toContain("/metrics/child");
  });

  test("turning subfolders on for an existing sync is refused", async () => {
    const { secretSync } = await newSync({ name: "recursive-turned-on-later", recursive: false });

    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/secret-syncs/aws-parameter-store/${secretSync!.id}`,
      headers: adminHeaders,
      body: {
        syncOptions: {
          initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
          recursive: true
        }
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("DB_URL");
    expect(res.json().message).toContain("/backend/api");
  });
});
