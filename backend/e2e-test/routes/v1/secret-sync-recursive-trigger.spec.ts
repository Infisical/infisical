import { randomUUID } from "node:crypto";

import { fakeParameterStore } from "e2e-test/fakes/aws-parameter-store-sync-fns";
import { createFolder } from "e2e-test/testUtils/folders";
import {
  createAwsAppConnection,
  createSecretSync,
  deleteAppConnection,
  deleteSecretSync,
  expectDestinationUnchanged,
  setAutoSync,
  waitForDestinationSecrets,
  waitForSyncRun
} from "e2e-test/testUtils/secret-syncs";
import { createSecretV2 } from "e2e-test/testUtils/secrets";

import { initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { SecretSyncInitialSyncBehavior } from "@app/services/secret-sync/secret-sync-enums";

// A write inside a recursive sync's subtree must still queue that sync, and a write inside a
// non-recursive sync's subtree must not queue it. Both halves matter equally: the first is the
// bug (auto-sync silently stops covering subfolders), the second guards against over-triggering
// (syncing secrets the sync was never configured to cover).
//
// Each test waits for the auto-sync-enable run to finish (via waitForSyncRun) before writing the
// subfolder secret. Skipping that wait would let the enable-time run, which always resolves the
// full recursive subtree at whatever the DB holds when it executes, pick up the later write by
// coincidence and mask a missing trigger.

const ENV = "dev";
const REGION = "us-east-1";

const adminHeaders = { authorization: `Bearer ${jwtAuthToken}` };

describe("A write in a subfolder triggers only the recursive sync above it", async () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  let projectId: string;
  let connectionId: string;
  const createdSyncIds: string[] = [];

  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);

    const suffix = randomUUID().slice(0, 8);

    const projectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: adminHeaders,
      body: { projectName: `secret-sync-recursive-trigger-${suffix}` }
    });
    expect(projectRes.statusCode).toBe(200);
    projectId = projectRes.json().project.id as string;

    connectionId = await createAwsAppConnection({
      name: `secret-sync-recursive-trigger-${suffix}`,
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

  test("a write at a subfolder reaches the recursive sync rooted above it", async () => {
    const destinationPath = "/recursive-trigger-target/";

    const { secretSync } = await createSecretSync({
      name: "recursive-trigger",
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: "/backend",
      region: REGION,
      destinationPath,
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      recursive: true,
      isAutoSyncEnabled: false,
      authToken: jwtAuthToken
    });
    createdSyncIds.push(secretSync!.id);

    const runCountBeforeEnable = fakeParameterStore.at(REGION, destinationPath).runCount();
    await setAutoSync({ syncId: secretSync!.id, isAutoSyncEnabled: true, authToken: jwtAuthToken });
    await waitForSyncRun({
      syncId: secretSync!.id,
      region: REGION,
      destinationPath,
      runCountBefore: runCountBeforeEnable,
      authToken: jwtAuthToken
    });

    expect(fakeParameterStore.at(REGION, destinationPath).read()).toEqual({});

    await createSecretV2({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/backend/api",
      key: "SUBFOLDER_KEY",
      value: "subfolder-value"
    });

    await waitForDestinationSecrets({
      region: REGION,
      destinationPath,
      expected: { SUBFOLDER_KEY: "subfolder-value" }
    });
  });

  test("a write at a subfolder does not reach a non-recursive sync rooted above it", async () => {
    const destinationPath = "/non-recursive-trigger-target/";

    const { secretSync } = await createSecretSync({
      name: "non-recursive-trigger",
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: "/backend",
      region: REGION,
      destinationPath,
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      recursive: false,
      isAutoSyncEnabled: false,
      authToken: jwtAuthToken
    });
    createdSyncIds.push(secretSync!.id);

    const runCountBeforeEnable = fakeParameterStore.at(REGION, destinationPath).runCount();
    await setAutoSync({ syncId: secretSync!.id, isAutoSyncEnabled: true, authToken: jwtAuthToken });
    await waitForSyncRun({
      syncId: secretSync!.id,
      region: REGION,
      destinationPath,
      runCountBefore: runCountBeforeEnable,
      authToken: jwtAuthToken
    });

    expect(fakeParameterStore.at(REGION, destinationPath).read()).toEqual({});

    await createSecretV2({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/backend/api",
      key: "API_KEY",
      value: "api-value"
    });

    await expectDestinationUnchanged({
      region: REGION,
      destinationPath,
      expected: {}
    });
  });
});
