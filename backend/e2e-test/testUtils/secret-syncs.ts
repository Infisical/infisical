import { fakeParameterStore } from "e2e-test/fakes/aws-parameter-store-sync-fns";

import { SecretSyncInitialSyncBehavior } from "@app/services/secret-sync/secret-sync-enums";
import { SecretSyncStatus } from "@app/services/secret-sync/secret-sync-types";

// Every spec drives AWS Parameter Store, which is faked for the whole e2e run. See
// e2e-test/fakes/ and the alias block in vitest.e2e.config.mts.
const DESTINATION = "aws-parameter-store";

const SYNC_TIMEOUT_MS = 20_000;
const SYNC_POLL_MS = 100;

type TSecretSyncRecord = {
  id: string;
  name: string;
  syncStatus: string | null;
  importStatus: string | null;
  removeStatus: string | null;
  lastSyncMessage: string | null;
  lastImportMessage: string | null;
  lastRemoveMessage: string | null;
  lastSyncedAt: string | null;
};

const TERMINAL_STATUSES: string[] = [SecretSyncStatus.Succeeded, SecretSyncStatus.Failed];

export const createAwsAppConnection = async (dto: { name: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/app-connections/aws`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: {
      name: dto.name,
      method: "access-key",
      credentials: {
        accessKeyId: "AKIAFAKEACCESSKEYID",
        secretAccessKey: "fake-secret-access-key"
      }
    }
  });

  expect(res.statusCode).toBe(200);
  return res.json().appConnection.id as string;
};

export const deleteAppConnection = async (dto: { connectionId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/app-connections/aws/${dto.connectionId}`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });

  expect(res.statusCode).toBe(200);
};

export const createSecretSync = async (dto: {
  name: string;
  projectId: string;
  connectionId: string;
  environmentSlug: string;
  secretPath: string;
  // The region and path address the fake destination, so a spec can seed it before the sync
  // exists. Creating a sync with auto sync on runs it immediately.
  region: string;
  destinationPath: string;
  initialSyncBehavior?: SecretSyncInitialSyncBehavior;
  keySchema?: string;
  disableSecretDeletion?: boolean;
  isAutoSyncEnabled?: boolean;
  authToken: string;
  expectStatusCode?: number;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/secret-syncs/${DESTINATION}`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: {
      name: dto.name,
      projectId: dto.projectId,
      connectionId: dto.connectionId,
      environment: dto.environmentSlug,
      secretPath: dto.secretPath,
      isAutoSyncEnabled: dto.isAutoSyncEnabled ?? false,
      syncOptions: {
        initialSyncBehavior: dto.initialSyncBehavior ?? SecretSyncInitialSyncBehavior.OverwriteDestination,
        ...(dto.keySchema ? { keySchema: dto.keySchema } : {}),
        ...(dto.disableSecretDeletion === undefined ? {} : { disableSecretDeletion: dto.disableSecretDeletion })
      },
      destinationConfig: { region: dto.region, path: dto.destinationPath }
    }
  });

  expect(res.statusCode).toBe(dto.expectStatusCode ?? 200);

  // A spec asserting a rejection wants the body, not an id.
  if ((dto.expectStatusCode ?? 200) !== 200) return { error: res.json() };

  return { secretSync: res.json().secretSync as TSecretSyncRecord };
};

export const getSecretSync = async (dto: { syncId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v1/secret-syncs/${DESTINATION}/${dto.syncId}`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });

  expect(res.statusCode).toBe(200);
  return res.json().secretSync as TSecretSyncRecord;
};

export const deleteSecretSync = async (dto: { syncId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/secret-syncs/${DESTINATION}/${dto.syncId}`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: { removeSecrets: false }
  });

  expect(res.statusCode).toBe(200);
};

const pollUntil = async <T>(dto: { describe: string; read: () => Promise<T> | T; done: (value: T) => boolean }) => {
  const deadline = Date.now() + SYNC_TIMEOUT_MS;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const value = await dto.read();
    if (dto.done(value)) return value;

    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${SYNC_TIMEOUT_MS}ms waiting for ${dto.describe}`);
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, SYNC_POLL_MS);
    });
  }
};

// Waits on the fake's own run counter before reading the record, rather than on the record
// alone. triggerSecretSyncSyncSecretsById writes syncStatus "pending" *after* enqueuing the job
// (secret-sync-service.ts:800), so a status-only wait races that write and can sit on a stale
// "succeeded" from an earlier run.
export const waitForSyncRun = async (dto: {
  syncId: string;
  region: string;
  destinationPath: string;
  runCountBefore: number;
  authToken: string;
}) => {
  await pollUntil({
    describe: `a sync run to reach the destination at ${dto.region}${dto.destinationPath}`,
    read: () => fakeParameterStore.at(dto.region, dto.destinationPath).runCount(),
    done: (runCount) => runCount > dto.runCountBefore
  });

  return pollUntil({
    describe: `secret sync "${dto.syncId}" to report a terminal sync status`,
    read: () => getSecretSync({ syncId: dto.syncId, authToken: dto.authToken }),
    done: (sync) => TERMINAL_STATUSES.includes(sync.syncStatus ?? "")
  });
};

export const triggerSecretSync = async (dto: {
  syncId: string;
  region: string;
  destinationPath: string;
  authToken: string;
}) => {
  const runCountBefore = fakeParameterStore.at(dto.region, dto.destinationPath).runCount();

  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/secret-syncs/${DESTINATION}/${dto.syncId}/sync-secrets`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });

  expect(res.statusCode).toBe(200);

  return waitForSyncRun({ ...dto, runCountBefore });
};

export const importSecretsForSync = async (dto: {
  syncId: string;
  importBehavior: "prioritize-source" | "prioritize-destination";
  authToken: string;
  expectStatusCode?: number;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/secret-syncs/${DESTINATION}/${dto.syncId}/import-secrets`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: { importBehavior: dto.importBehavior }
  });

  expect(res.statusCode).toBe(dto.expectStatusCode ?? 200);

  if ((dto.expectStatusCode ?? 200) !== 200) return { error: res.json() };

  const sync = await pollUntil({
    describe: `secret sync "${dto.syncId}" to report a terminal import status`,
    read: () => getSecretSync({ syncId: dto.syncId, authToken: dto.authToken }),
    done: (record) => TERMINAL_STATUSES.includes(record.importStatus ?? "")
  });

  return { secretSync: sync };
};

export const removeSecretsForSync = async (dto: { syncId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/secret-syncs/${DESTINATION}/${dto.syncId}/remove-secrets`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });

  expect(res.statusCode).toBe(200);

  return pollUntil({
    describe: `secret sync "${dto.syncId}" to report a terminal remove status`,
    read: () => getSecretSync({ syncId: dto.syncId, authToken: dto.authToken }),
    done: (record) => TERMINAL_STATUSES.includes(record.removeStatus ?? "")
  });
};

// A spec that expects no sync run has to wait out a window in which one could have happened;
// asserting an absence immediately would pass simply because nothing had run yet.
export const expectNoSyncRun = async (dto: {
  region: string;
  destinationPath: string;
  runCountBefore: number;
  windowMs?: number;
}) => {
  await new Promise((resolve) => {
    setTimeout(resolve, dto.windowMs ?? 2_000);
  });

  expect(fakeParameterStore.at(dto.region, dto.destinationPath).runCount()).toBe(dto.runCountBefore);
};
