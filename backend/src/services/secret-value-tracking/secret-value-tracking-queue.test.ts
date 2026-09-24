import { KeyStorePrefixes } from "@app/keystore/keystore";
import { initLogger } from "@app/lib/logger";

import { secretValueTrackingQueueFactory } from "./secret-value-tracking-queue";
import { TBackfillRunState } from "./secret-value-tracking-types";

const ORG_ID = "org-1";

type TFakeSecret = { id: string; key: string; folderId: string; hasOrgDigest: boolean };

// Drives the real job handler over in-memory fakes. The e2e suite cannot reach this layer: it runs
// one project whose secrets fit in a single chunk, so every bug that only shows on a resumed chunk
// or at a project boundary is invisible to it.
const makeHarness = ({
  projectIds,
  foldersByProject,
  secrets = []
}: {
  projectIds: string[];
  foldersByProject: Record<string, string[]>;
  secrets?: TFakeSecret[];
}) => {
  const store = new Map<string, string>();
  const queued: { payload: unknown; opts: Record<string, unknown> }[] = [];
  const flaggedProjects: string[] = [];
  const flaggedOrgs: string[] = [];
  const folderReads: string[] = [];
  let rows = [...secrets];
  let handler: (job: { data: unknown }) => Promise<void> = async () => {};

  const keyStore = {
    getItemPrimary: async (key: string) => store.get(key) ?? null,
    setItemWithExpiry: async (key: string, _ttl: number | string, value: string | number | Buffer) => {
      store.set(key, String(value));
      return "OK" as const;
    },
    setItemWithExpiryNX: async (key: string, _ttl: number | string, value: string | number | Buffer) => {
      if (store.has(key)) return null;
      store.set(key, String(value));
      return "OK" as const;
    },
    deleteItem: async (key: string) => {
      store.delete(key);
      return 1;
    },
    deleteItems: async () => 0
  };

  const queueService = {
    start: (_name: unknown, jobHandler: (job: { data: unknown }) => Promise<void>) => {
      handler = jobHandler;
    },
    listen: () => {},
    queue: async (_name: unknown, _job: unknown, payload: unknown, opts: Record<string, unknown>) => {
      queued.push({ payload, opts });
    }
  };

  const factory = secretValueTrackingQueueFactory({
    queueService: queueService as never,
    keyStore: keyStore as never,
    projectDAL: {
      find: async () => projectIds.map((id) => ({ id, orgId: ORG_ID })) as never,
      findById: async (id: string) => ({ id, orgId: ORG_ID }) as never,
      updateById: async (id: string) => {
        flaggedProjects.push(id);
        return {} as never;
      }
    } as never,
    orgDAL: {
      updateById: async (id: string) => {
        flaggedOrgs.push(id);
        return {} as never;
      }
    } as never,
    folderDAL: {
      findByProjectId: async (projectId: string) => {
        folderReads.push(projectId);
        return (foldersByProject[projectId] ?? []).map((id) => ({ id })) as never;
      }
    } as never,
    secretV2BridgeDAL: {
      findSecretsInFolderAfter: async (folderId: string, after: { key: string; id: string }, limit: number) =>
        rows
          .filter((row) => row.folderId === folderId)
          .filter((row) => [row.key, row.id] > [after.key, after.id])
          .sort((a, b) => (a.key === b.key ? a.id.localeCompare(b.id) : a.key.localeCompare(b.key)))
          .slice(0, limit)
          .map((row) => ({
            id: row.id,
            key: row.key,
            encryptedValue: Buffer.from(row.id),
            secretValueBlindIndex: "project-digest",
            secretValueOrgBlindIndex: row.hasOrgDigest ? "org-digest" : null
          })) as never,
      batchSetBlindIndexes: async (updates: { id: string }[]) => {
        const filled = new Set(updates.map((u) => u.id));
        rows = rows.map((row) => (filled.has(row.id) ? { ...row, hasOrgDigest: true } : row));
      }
    } as never,
    kmsService: {
      createCipherPairWithDataKey: async () => ({
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob,
        generateSecretBlindIndex: async (value: Buffer) => `digest-${value.toString()}`
      })
    } as never
  });

  const stateKey = KeyStorePrefixes.SecretValueTrackingBackfill(ORG_ID);

  return {
    factory,
    queued,
    flaggedProjects,
    flaggedOrgs,
    folderReads,
    rowsNow: () => rows,
    setState: (state: TBackfillRunState) => store.set(stateKey, JSON.stringify(state)),
    getState: () => {
      const raw = store.get(stateKey);
      return raw ? (JSON.parse(raw) as TBackfillRunState) : null;
    },
    runChunk: () => handler({ data: { scope: "org", orgId: ORG_ID } })
  };
};

const runningState = (cursor: TBackfillRunState["cursor"]): TBackfillRunState => ({
  status: "running",
  cursor,
  projectsTotal: 2,
  projectsDone: 0,
  secretsProcessed: 0,
  lastProgressAt: new Date().toISOString()
});

describe("the backfill job", () => {
  // The job logs its own lifecycle, and the unit environment boots no server to initialise it.
  beforeAll(() => {
    initLogger();
  });

  test("a chunk resuming inside one project still reaches the org's other projects", async () => {
    const harness = makeHarness({
      projectIds: ["p1", "p2"],
      foldersByProject: { p1: ["f1"], p2: ["f2"] },
      secrets: [
        { id: "s1", key: "A", folderId: "f1", hasOrgDigest: true },
        { id: "s2", key: "B", folderId: "f2", hasOrgDigest: false }
      ]
    });

    // A resumed chunk: the cursor is already inside p1, exactly as the previous chunk left it.
    harness.setState(runningState({ projectId: "p1", folderId: "f1", key: "A", id: "s1" }));

    await harness.runChunk();

    // The bug this pins: the resumed chunk saw only p1's folders, read every later project as
    // empty, stopped at the p1 boundary and flagged the org complete with s2 still unindexed.
    expect(harness.rowsNow().find((row) => row.id === "s2")?.hasOrgDigest).toBe(true);
    expect(harness.flaggedProjects).toEqual(["p1", "p2"]);
    // Both projects really are done here, so flagging the org is right.
    expect(harness.flaggedOrgs).toEqual([ORG_ID]);
  });

  test("a finished run leaves its final counters behind for the UI to show", async () => {
    const harness = makeHarness({
      projectIds: ["p1", "p2"],
      foldersByProject: { p1: ["f1"], p2: ["f2"] },
      secrets: [
        { id: "s1", key: "A", folderId: "f1", hasOrgDigest: false },
        { id: "s2", key: "B", folderId: "f2", hasOrgDigest: false }
      ]
    });

    harness.setState(runningState(null));
    await harness.runChunk();

    // The durable answer to "is it done" is still the flag. These numbers only let the UI show what
    // the run got through, so they have to survive the run rather than be cleared with the cursor.
    const finished = harness.getState();
    expect(finished?.status).toBe("completed");
    expect(finished?.projectsDone).toBe(2);
    expect(finished?.secretsProcessed).toBe(2);
    expect(finished?.cursor).toBeNull();
  });

  test("a cursor on a project deleted since the last chunk carries on with the rest", async () => {
    const harness = makeHarness({
      projectIds: ["p1", "p2"],
      foldersByProject: { p1: ["f1"], p2: ["f2"] },
      secrets: [{ id: "s2", key: "B", folderId: "f2", hasOrgDigest: false }]
    });

    harness.setState(runningState({ projectId: "gone", folderId: "gone-folder", key: "", id: "" }));

    await harness.runChunk();

    expect(harness.flaggedProjects).not.toContain("gone");
    expect(harness.rowsNow().find((row) => row.id === "s2")?.hasOrgDigest).toBe(true);
  });

  test("a project's folders are only read when the walk reaches it", async () => {
    const harness = makeHarness({
      projectIds: ["p1", "p2", "p3"],
      foldersByProject: { p1: ["f1"], p2: ["f2"], p3: ["f3"] },
      secrets: [{ id: "s1", key: "A", folderId: "f1", hasOrgDigest: false }]
    });

    harness.setState(runningState({ projectId: "p1", folderId: "f1", key: "", id: "" }));
    await harness.runChunk();

    // Every project is reached in this run, but each is read once rather than all up front.
    expect(harness.folderReads.filter((id) => id === "p1")).toHaveLength(1);
  });

  test("a run over many empty folders checkpoints instead of querying without bound", async () => {
    const folders = Array.from({ length: 5000 }, (_, i) => `empty-${i}`);
    const harness = makeHarness({
      projectIds: ["p1"],
      foldersByProject: { p1: folders },
      secrets: []
    });

    harness.setState(runningState(null));
    await harness.runChunk();

    // Empty folders read no rows, so a chunk bounded only on rows would walk all 5000 in one job.
    expect(harness.queued).toHaveLength(1);
    expect(harness.getState()?.cursor).not.toBeNull();
    // Work remains, so nothing may claim the org is searchable yet.
    expect(harness.flaggedOrgs).toEqual([]);
  });

  test("a queued chunk asks for retries so one transient failure does not kill the chain", async () => {
    const harness = makeHarness({
      projectIds: ["p1"],
      foldersByProject: { p1: Array.from({ length: 5000 }, (_, i) => `empty-${i}`) },
      secrets: []
    });

    harness.setState(runningState(null));
    await harness.runChunk();

    expect(harness.queued[0].opts.attempts).toBeGreaterThan(1);
  });
});
