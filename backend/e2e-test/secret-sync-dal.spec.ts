import { randomUUID } from "node:crypto";

import { createAwsAppConnection, deleteAwsAppConnection } from "e2e-test/testUtils/app-connections";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { createSecretSync, deleteSecretSync } from "e2e-test/testUtils/secret-syncs";
import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { secretSyncDALFactory } from "@app/services/secret-sync/secret-sync-dal";
import { SecretSyncStatus } from "@app/services/secret-sync/secret-sync-types";

declare const testDb: Knex;

const secretSyncDAL = secretSyncDALFactory(testDb, secretFolderDALFactory(testDb));

const ENV = "dev";
const SOURCE_PATH = "/services/api";

// Secret loading reads `folder: null` as "the source folder no longer exists" and fails the sync
// without retrying. A read that skips path resolution must therefore leave `folder` out, not null,
// or a healthy sync passed to secret loading is failed for a folder that is still there.
describe("Secret sync DAL folder path resolution", () => {
  let projectId: string;
  let authToken: string;
  let cleanupOrg: () => Promise<void>;
  let connectionId: string;
  let sourceFolderId: string;
  let syncId: string;
  const createdSyncIds: string[] = [];

  const newSync = async (name: string, secretPath: string) => {
    const { secretSync } = await createSecretSync({
      name: `${name}-${randomUUID().slice(0, 8)}`,
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath,
      region: "us-east-1",
      destinationPath: `/${name}/`,
      authToken
    });
    createdSyncIds.push(secretSync!.id);
    return secretSync!.id;
  };

  beforeAll(async () => {
    ({ projectId, authToken, cleanup: cleanupOrg } = await createIsolatedOrgAndProject("secret-sync-dal-e2e"));

    connectionId = await createAwsAppConnection({
      name: `secret-sync-dal-e2e-${randomUUID().slice(0, 8)}`,
      authToken
    });

    await createFolder({ authToken, workspaceId: projectId, environmentSlug: ENV, secretPath: "/", name: "services" });
    ({ id: sourceFolderId } = await createFolder({
      authToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/services",
      name: "api"
    }));

    syncId = await newSync("folder-path", SOURCE_PATH);
  });

  afterAll(async () => {
    // Syncs hold a foreign key to the connection, and the org delete only soft deletes the project.
    for (const id of createdSyncIds) {
      // eslint-disable-next-line no-await-in-loop
      await deleteSecretSync({ syncId: id, authToken });
    }

    await deleteAwsAppConnection({ connectionId, authToken });
    await cleanupOrg();
  });

  test("findById resolves the source folder path by default", async () => {
    const secretSync = await secretSyncDAL.findById(syncId);

    expect(secretSync?.folder).toEqual({ id: sourceFolderId, path: SOURCE_PATH });
  });

  test("findById without the folder path omits folder instead of reporting it missing", async () => {
    const secretSync = await secretSyncDAL.findById(syncId, undefined, { includeFolderPath: false });

    expect(secretSync).toBeDefined();
    expect(secretSync).not.toHaveProperty("folder");
    expect(secretSync?.folderId).toBe(sourceFolderId);
    expect(secretSync?.environment?.slug).toBe(ENV);
  });

  test("updateById without the folder path omits folder and still applies the update", async () => {
    const updated = await secretSyncDAL.updateById(
      syncId,
      { syncStatus: SecretSyncStatus.Failed, lastSyncMessage: "destination refused the write" },
      { includeFolderPath: false }
    );

    expect(updated).not.toHaveProperty("folder");
    expect(updated.folderId).toBe(sourceFolderId);
    expect(updated.syncStatus).toBe(SecretSyncStatus.Failed);
    expect(updated.lastSyncMessage).toBe("destination refused the write");

    const reread = await secretSyncDAL.findById(syncId);
    expect(reread?.folder).toEqual({ id: sourceFolderId, path: SOURCE_PATH });
  });

  test("find without the folder path omits folder on every row", async () => {
    const secretSyncs = await secretSyncDAL.find({ projectId }, undefined, { includeFolderPath: false });

    expect(secretSyncs.map((secretSync) => secretSync.id)).toContain(syncId);
    secretSyncs.forEach((secretSync) => expect(secretSync).not.toHaveProperty("folder"));
  });

  test("find resolves the source folder path by default", async () => {
    const secretSyncs = await secretSyncDAL.find({ id: syncId });

    expect(secretSyncs).toHaveLength(1);
    expect(secretSyncs[0].folder).toEqual({ id: sourceFolderId, path: SOURCE_PATH });
  });

  test("folder is null only once the source folder is gone", async () => {
    const { id: doomedFolderId } = await createFolder({
      authToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      name: "doomed"
    });
    const doomedSyncId = await newSync("folder-gone", "/doomed");

    expect((await secretSyncDAL.findById(doomedSyncId))?.folder).toEqual({ id: doomedFolderId, path: "/doomed" });

    await deleteFolder({
      authToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      id: doomedFolderId
    });

    expect((await secretSyncDAL.findById(doomedSyncId))?.folder).toBeNull();
  });
});
