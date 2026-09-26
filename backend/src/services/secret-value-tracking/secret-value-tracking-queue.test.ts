import { initLogger } from "@app/lib/logger";

import { secretValueTrackingQueueFactory } from "./secret-value-tracking-queue";

const ORG_ID = "org-1";

type TFakeSecret = { id: string; key: string; folderId: string; hasOrgDigest: boolean };

// Drives the real job handler over in-memory fakes. The e2e suite runs one project with a handful
// of secrets, so anything that only shows at a project boundary, or across many projects, is
// invisible to it.
const makeHarness = ({
  projectIds,
  foldersByProject,
  secrets = []
}: {
  projectIds: string[];
  foldersByProject: Record<string, string[]>;
  secrets?: TFakeSecret[];
}) => {
  const queued: { payload: unknown; opts: Record<string, unknown> }[] = [];
  const flaggedProjects: string[] = [];
  const flaggedOrgs: string[] = [];
  const folderReads: string[] = [];
  const progress: { projectsTotal: number; projectsDone: number; secretsProcessed: number }[] = [];
  let rows = [...secrets];
  let handler: (job: {
    data: unknown;
    updateProgress: (p: unknown) => Promise<void>;
  }) => Promise<void> = async () => {};

  const keyStore = { deleteItems: async () => 0 };

  const queueService = {
    start: (_name: unknown, jobHandler: typeof handler) => {
      handler = jobHandler;
    },
    listen: () => {},
    getJob: async () => undefined,
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

  return {
    factory,
    queued,
    flaggedProjects,
    flaggedOrgs,
    folderReads,
    progress,
    rowsNow: () => rows,
    run: () =>
      handler({
        data: { scope: "org", orgId: ORG_ID },
        updateProgress: async (p) => {
          progress.push(p as { projectsTotal: number; projectsDone: number; secretsProcessed: number });
        }
      })
  };
};

describe("the backfill job", () => {
  // The job logs its own lifecycle, and the unit environment boots no server to initialise it.
  beforeAll(() => {
    initLogger();
  });

  test("one run covers every project in the org", async () => {
    const harness = makeHarness({
      projectIds: ["p1", "p2", "p3"],
      foldersByProject: { p1: ["f1"], p2: ["f2"], p3: ["f3"] },
      secrets: [
        { id: "s1", key: "A", folderId: "f1", hasOrgDigest: false },
        { id: "s2", key: "B", folderId: "f2", hasOrgDigest: false },
        { id: "s3", key: "C", folderId: "f3", hasOrgDigest: false }
      ]
    });

    await harness.run();

    expect(harness.rowsNow().every((row) => row.hasOrgDigest)).toBe(true);
    expect(harness.flaggedProjects).toEqual(["p1", "p2", "p3"]);
    expect(harness.flaggedOrgs).toEqual([ORG_ID]);
  });

  test("a row that already carries both digests is left alone", async () => {
    const harness = makeHarness({
      projectIds: ["p1"],
      foldersByProject: { p1: ["f1"] },
      secrets: [
        { id: "done", key: "A", folderId: "f1", hasOrgDigest: true },
        { id: "todo", key: "B", folderId: "f1", hasOrgDigest: false }
      ]
    });

    await harness.run();

    // Only the one that needed work is counted, which is what makes a re-run cheap.
    expect(harness.progress.at(-1)?.secretsProcessed).toBe(1);
  });

  test("a project that has been deleted does not stop the walk", async () => {
    const harness = makeHarness({
      projectIds: ["p1", "p2"],
      foldersByProject: { p1: [], p2: ["f2"] },
      secrets: [{ id: "s2", key: "B", folderId: "f2", hasOrgDigest: false }]
    });

    await harness.run();

    expect(harness.rowsNow().find((row) => row.id === "s2")?.hasOrgDigest).toBe(true);
    expect(harness.flaggedOrgs).toEqual([ORG_ID]);
  });

  // A project with no folders holds no secrets to index, and every secret written later carries both
  // digests, so leaving it unflagged would only keep project duplicate detection off for no reason.
  test("a project with no folders at all is still flagged", async () => {
    const harness = makeHarness({
      projectIds: ["empty", "p2"],
      foldersByProject: { empty: [], p2: ["f2"] },
      secrets: [{ id: "s2", key: "B", folderId: "f2", hasOrgDigest: false }]
    });

    await harness.run();

    expect([...harness.flaggedProjects].sort()).toEqual(["empty", "p2"]);
  });

  test("an org with no secrets management projects is still flagged", async () => {
    const harness = makeHarness({ projectIds: [], foldersByProject: {} });

    await harness.run();

    expect(harness.flaggedOrgs).toEqual([ORG_ID]);
  });

  test("an org with nothing in it still finishes and is flagged", async () => {
    const harness = makeHarness({ projectIds: ["p1"], foldersByProject: { p1: ["f1"] }, secrets: [] });

    await harness.run();

    expect(harness.flaggedOrgs).toEqual([ORG_ID]);
    expect(harness.progress.at(-1)?.secretsProcessed).toBe(0);
  });

  test("progress is reported as the walk goes, not only at the end", async () => {
    const harness = makeHarness({
      projectIds: ["p1", "p2"],
      foldersByProject: { p1: ["f1"], p2: ["f2"] },
      secrets: [
        { id: "s1", key: "A", folderId: "f1", hasOrgDigest: false },
        { id: "s2", key: "B", folderId: "f2", hasOrgDigest: false }
      ]
    });

    await harness.run();

    // BullMQ reads these as the heartbeat that tells a working job from a stalled one, so a long
    // walk has to report more than once.
    expect(harness.progress.length).toBeGreaterThan(1);
    expect(harness.progress.at(-1)).toEqual({ projectsTotal: 2, projectsDone: 2, secretsProcessed: 2 });
  });
});
