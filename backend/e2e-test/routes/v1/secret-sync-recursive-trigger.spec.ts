import { randomUUID } from "node:crypto";

import { fakeParameterStore } from "e2e-test/fakes/aws-parameter-store-sync-fns";
import { createFolder } from "e2e-test/testUtils/folders";
import {
  createAwsAppConnection,
  createSecretSync,
  deleteAppConnection,
  deleteSecretSync,
  setAutoSync,
  waitForDestinationSecrets,
  waitForSyncRun
} from "e2e-test/testUtils/secret-syncs";
import { createSecretV2 } from "e2e-test/testUtils/secrets";

import { initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { SecretSyncInitialSyncBehavior } from "@app/services/secret-sync/secret-sync-enums";

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
    await createFolder({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/backend",
      name: "web"
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
    const controlDestinationPath = "/non-recursive-trigger-control/";

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

    // A control sync rooted exactly on the folder that is about to change. Its own trigger is
    // the ordinary exact-match path, unaffected by the change under test, so waiting for it to
    // pick up the write below gives a real signal that the queue has processed that write and
    // made its trigger decisions for every sync watching the project, including the
    // non-recursive one. Asserting against that signal, rather than a fixed delay, means a
    // reintroduced over-trigger bug cannot hide behind a slow CI runner.
    const { secretSync: controlSync } = await createSecretSync({
      name: "non-recursive-trigger-control",
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: "/backend/web",
      region: REGION,
      destinationPath: controlDestinationPath,
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      recursive: false,
      isAutoSyncEnabled: false,
      authToken: jwtAuthToken
    });
    createdSyncIds.push(controlSync!.id);

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

    const controlRunCountBeforeEnable = fakeParameterStore.at(REGION, controlDestinationPath).runCount();
    await setAutoSync({ syncId: controlSync!.id, isAutoSyncEnabled: true, authToken: jwtAuthToken });
    await waitForSyncRun({
      syncId: controlSync!.id,
      region: REGION,
      destinationPath: controlDestinationPath,
      runCountBefore: controlRunCountBeforeEnable,
      authToken: jwtAuthToken
    });

    expect(fakeParameterStore.at(REGION, controlDestinationPath).read()).toEqual({});

    await createSecretV2({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/backend/web",
      key: "WEB_KEY",
      value: "web-value"
    });

    await waitForDestinationSecrets({
      region: REGION,
      destinationPath: controlDestinationPath,
      expected: { WEB_KEY: "web-value" }
    });

    expect(fakeParameterStore.at(REGION, destinationPath).read()).toEqual({});
  });
});
