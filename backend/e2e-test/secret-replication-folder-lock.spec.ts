import { Knex } from "knex";
import { afterEach, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import {
  findOrCreateReplicationFolder,
  getReplicationFolderName
} from "@app/ee/services/secret-replication/secret-replication-fns";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { secretImportDALFactory } from "@app/services/secret-import/secret-import-dal";

import { createIsolatedOrgAndProject } from "./testUtils/fixtures";
import { createFolder } from "./testUtils/folders";
import { pollUntil } from "./testUtils/poll";

const folderDAL = secretFolderDALFactory(testDb);
const secretImportDAL = secretImportDALFactory(testDb);

const waitUntilBlockedBy = (pid: number) =>
  pollUntil({
    describe: `a query blocked by backend ${pid}`,
    read: async () => {
      const { rows } = await testDb.raw(
        "select count(*)::int as waiting from pg_stat_activity where ? = any(pg_blocking_pids(pid))",
        [pid]
      );
      return rows[0].waiting as number;
    },
    done: (waiting) => waiting > 0,
    timeoutMs: 5_000
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

// A replication import into dev:/app from staging:/, inserted directly so that no replication job is
// queued and the test alone decides when the reserved folder is looked up.
const setUp = async () => {
  const fixture = await createIsolatedOrgAndProject("replication-lock");
  const folder = await createFolder({
    workspaceId: fixture.projectId,
    environmentSlug: "dev",
    secretPath: "/",
    name: "app",
    authToken: fixture.authToken
  });
  const destinationFolder = await testDb(TableName.SecretFolder)
    .where({ id: folder.id })
    .first("id", "envId")
    .then((row) => row as { id: string; envId: string });
  const staging = await testDb(TableName.Environment)
    .where({ projectId: fixture.projectId, slug: "staging" })
    .first("id")
    .then((row) => row as { id: string });
  const [secretImport] = await testDb(TableName.SecretImport)
    .insert({
      folderId: destinationFolder.id,
      importEnv: staging.id,
      importPath: "/",
      isReplication: true,
      position: 1
    })
    .returning("*");
  return { fixture, destinationFolder, importId: secretImport.id as string };
};

const reservedFolderCount = async (parentId: string, importId: string) => {
  const rows = await testDb(TableName.SecretFolder)
    .where({ parentId, name: getReplicationFolderName(importId) })
    .select("id");
  return rows.length;
};

// Runs the lookup as a replication job would, paused inside its transaction right after it takes its locks.
const startPausedJob = (importId: string, destinationFolder: { id: string; envId: string }) => {
  const locked = deferred<number>();
  const proceed = deferred<void>();
  const job = findOrCreateReplicationFolder({
    folderDAL,
    secretImportDAL: {
      lockWithFolderAgainstDelete: async (dto, tx) => {
        const doc = await secretImportDAL.lockWithFolderAgainstDelete(dto, tx);
        const { rows } = await tx.raw("select pg_backend_pid() as pid");
        locked.resolve(rows[0].pid as number);
        await proceed.promise;
        return doc;
      }
    },
    destinationSecretImportId: importId,
    destinationFolder
  });
  return { job, pid: locked.promise, proceed: () => proceed.resolve() };
};

describe("findOrCreateReplicationFolder", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  test("does not recreate the reserved folder of an import deleted after the job listed it", async () => {
    const { fixture, destinationFolder, importId } = await setUp();
    cleanup = fixture.cleanup;

    await testDb(TableName.SecretImport).where({ id: importId }).delete();
    const folder = await findOrCreateReplicationFolder({
      folderDAL,
      secretImportDAL,
      destinationSecretImportId: importId,
      destinationFolder
    });

    expect(folder).toBeUndefined();
    expect(await reservedFolderCount(destinationFolder.id, importId)).toBe(0);
  });

  // Both deletes lock their own row before cascading to the import, so the job has to take its locks in
  // the same order. In the opposite order the job's folder insert and the cascade wait on each other.
  test.each([
    {
      target: "destination folder",
      remove: (tx: Knex, ids: { folderId: string; envId: string }) =>
        tx(TableName.SecretFolder).where({ id: ids.folderId }).delete()
    },
    {
      target: "environment",
      remove: (tx: Knex, ids: { folderId: string; envId: string }) =>
        tx(TableName.Environment).where({ id: ids.envId }).delete()
    }
  ])("a delete of the $target waits for the job and then removes the folder it created", async ({ remove }) => {
    const { fixture, destinationFolder, importId } = await setUp();
    cleanup = fixture.cleanup;

    const { job, pid, proceed } = startPausedJob(importId, destinationFolder);
    const jobPid = await pid;
    const deletion = await testDb.transaction();
    try {
      const removed = remove(deletion, { folderId: destinationFolder.id, envId: destinationFolder.envId }).then(
        () => undefined
      );
      await waitUntilBlockedBy(jobPid);
      proceed();

      const [folder] = await Promise.all([job, removed]);
      await deletion.commit();

      expect(folder?.name).toBe(getReplicationFolderName(importId));
      expect(await reservedFolderCount(destinationFolder.id, importId)).toBe(0);
    } finally {
      proceed();
      if (!deletion.isCompleted()) await deletion.rollback();
    }
  });

  // The redis replication lock can expire mid-job, so two workers can reach the same import at once.
  test("a second worker waits for the first and reuses the folder it created", async () => {
    const { fixture, destinationFolder, importId } = await setUp();
    cleanup = fixture.cleanup;

    const first = startPausedJob(importId, destinationFolder);
    try {
      const firstPid = await first.pid;
      const second = findOrCreateReplicationFolder({
        folderDAL,
        secretImportDAL,
        destinationSecretImportId: importId,
        destinationFolder
      });
      await waitUntilBlockedBy(firstPid);
      first.proceed();

      const [created, reused] = await Promise.all([first.job, second]);
      expect(reused?.id).toBe(created?.id);
      expect(await reservedFolderCount(destinationFolder.id, importId)).toBe(1);
    } finally {
      first.proceed();
    }
  });
});
