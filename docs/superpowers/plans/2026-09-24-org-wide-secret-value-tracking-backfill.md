# Org-wide Secret Value Tracking Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose the project blind index backfill into one chunked, resumable job that walks either a single project or a whole organization, and gate secret value search on the organization's backfill having completed.

**Architecture:** One BullMQ job walks projects, then folders, then rows, using keyset pagination over the existing `idx_secrets_v2_folder_id_key`. Each job processes up to 5000 secrets, writes its cursor to a Redis key, and queues its successor, so no single job holds a worker for long. Completion is a durable boolean on `organizations`; everything transient (status, cursor, progress, last progress time) lives in the Redis key with a 2 day TTL.

**Tech Stack:** TypeScript, Fastify 4, Knex + PostgreSQL, BullMQ, ioredis via the keystore, Vitest, Zod.

**Spec:** `docs/superpowers/specs/2026-09-24-org-wide-secret-value-tracking-backfill-design.md`

## Global Constraints

- Path alias `@app/*` maps to `backend/src/*`. Imports are sorted by `simple-import-sort` in the group order documented in `backend/CLAUDE.md`.
- Every database call inside a `transaction()` callback passes `tx`. No network calls, sleeps, or unbounded row counts between BEGIN and COMMIT (`backend/CODE_QUALITY.md`).
- Every route needs `config.rateLimit`, `onRequest: verifyAuth([...])`, an `operationId`, and `.describe()` on body and querystring fields.
- Every user-facing error names the thing that is wrong in product vocabulary. No raw Knex errors reach the client.
- Default to no comments. A comment earns its place only by explaining why.
- Never use em dashes in any prose, comment, or message.
- The organization column is named for the capability, not the mechanism: `orgWideSecretValueTrackingEnabled`. Nothing on the organization schema says "blind index".
- Chunk size is 5000 secrets per job, read in database batches of 1000.
- Redis key TTL is 2 days (`172800` seconds). The staleness window for the double-trigger guard is 15 minutes (`900` seconds).
- `make reviewable-api` must pass before the final commit.

## Review Focus

These are the input classes the spec implies but that no task's happy-path test exercises. Each one has its test added to the task that owns the code.

1. A cursor naming a project or folder that has been deleted since the last chunk. The walk must step past it and continue, not throw. Covered in Task 2.
2. A folder that is empty, or whose every row already carries both digests. The walk must advance to the next folder rather than spin on the same cursor forever. Covered in Task 2.
3. A personal secret sharing a key with a shared secret in the same folder. The `(key, id)` cursor must visit both; a key-only cursor would skip one. This needs a real database, so it is covered by the e2e spec in Task 8 rather than by Task 4, which has no test of its own.
4. `lastProgressAt` exactly at the staleness boundary. The guard must be decisive rather than flapping between running and stalled. Covered in Task 3.
5. A malformed or truncated Redis payload (an older shape, a partial write). Reading it must degrade to "no run in progress" rather than throwing into the status endpoint. Covered in Task 3.

---

## File Structure

**Create:**
- `backend/src/db/migrations/20260924120000_add-org-wide-secret-value-tracking.ts`
  The organization column.
- `backend/src/services/secret-value-tracking/secret-value-tracking-types.ts`
  Cursor, run state, scope, and status types.
- `backend/src/services/secret-value-tracking/secret-value-tracking-fns.ts`
  Pure walk and status logic.
- `backend/src/services/secret-value-tracking/secret-value-tracking-fns.test.ts`
  Unit tests for the above.
- `backend/src/services/secret-value-tracking/secret-value-tracking-state.ts`
  The Redis key: claim, read, advance, clear.
- `backend/src/services/secret-value-tracking/secret-value-tracking-queue.ts`
  The chunked job.
- `backend/src/services/secret-value-tracking/secret-value-tracking-service.ts`
  Enable and status for both scopes, permissions, audit.
- `backend/e2e-test/routes/v1/org-secret-value-tracking.spec.ts`
  End to end.

**Modify:**
- `backend/src/db/schemas/organizations.ts`
  Regenerated, not hand edited.
- `backend/src/services/secret-v2-bridge/secret-v2-bridge-dal.ts`
  Keyset query, relaxed update guard.
- `backend/src/services/project/project-queue.ts`
  The blind index job and its helpers move out.
- `backend/src/services/project/project-service.ts`
  Delegate to the new service.
- `backend/src/services/secret-v2-bridge/secret-v2-bridge-service.ts`
  The search gate.
- `backend/src/server/routes/v1/organization-router.ts`
  The two new routes.
- `backend/src/server/routes/index.ts`
  Wiring.
- `backend/src/keystore/keystore.ts`
  The key prefix.
- `backend/src/queue/queue-service.ts`
  The widened payload.
- `backend/src/ee/services/audit-log/audit-log-types.ts`
  The audit event.

---

### Task 1: The organization flag

**Files:**
- Create: `backend/src/db/migrations/20260924120000_add-org-wide-secret-value-tracking.ts`
- Modify: `backend/src/db/schemas/organizations.ts` (regenerated)

**Interfaces:**
- Consumes: nothing.
- Produces: `organizations.orgWideSecretValueTrackingEnabled: boolean`, reachable as `OrganizationsSchema.shape.orgWideSecretValueTrackingEnabled` and on `TOrganizations`.

- [ ] **Step 1: Write the migration**

Copy the shape of `backend/src/db/migrations/20260604100000_add-secret-blind-index-enabled-to-project.ts`. New rows default to true because an organization created after this ships is complete by construction: every secret it writes carries both digests. Existing rows are set to false because their older secrets have no organization digest.

```ts
import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Organization)) {
    const hasColumn = await knex.schema.hasColumn(TableName.Organization, "orgWideSecretValueTrackingEnabled");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.Organization, (t) => {
        t.boolean("orgWideSecretValueTrackingEnabled").defaultTo(true).notNullable();
      });

      // Organizations that already exist hold secrets written before the org-scoped digest, so they
      // are incomplete until their backfill runs. Only organizations created from here on are
      // complete by construction.
      await knex(TableName.Organization).update({ orgWideSecretValueTrackingEnabled: false });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Organization)) {
    const hasColumn = await knex.schema.hasColumn(TableName.Organization, "orgWideSecretValueTrackingEnabled");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.Organization, (t) => {
        t.dropColumn("orgWideSecretValueTrackingEnabled");
      });
    }
  }
}
```

- [ ] **Step 2: Regenerate the schema**

Run: `cd backend && npm run migration:latest-dev && npm run generate:schema`

Expected: `backend/src/db/schemas/organizations.ts` gains `orgWideSecretValueTrackingEnabled: z.boolean().default(true),`. Do not hand edit that file.

- [ ] **Step 3: Verify the migration runs from empty**

Run: `make test-api-e2e SPEC=status`

Expected: PASS. The e2e environment drops the schema and runs every migration before the suite, so a green run is proof the migration applies cleanly from nothing.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/20260924120000_add-org-wide-secret-value-tracking.ts backend/src/db/schemas/organizations.ts
git commit -m "feat(secret-value-tracking): add the org-wide tracking flag"
```

---

### Task 2: Pure walk logic

**Files:**
- Create: `backend/src/services/secret-value-tracking/secret-value-tracking-types.ts`
- Create: `backend/src/services/secret-value-tracking/secret-value-tracking-fns.ts`
- Test: `backend/src/services/secret-value-tracking/secret-value-tracking-fns.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type TBackfillCursor = { projectId: string; folderId: string; key: string; id: string }`
  - `type TBackfillScope = { scope: "org"; orgId: string } | { scope: "project"; projectId: string }`
  - `type TBackfillRunState = { status: "running" | "failed"; cursor: TBackfillCursor | null; projectsTotal: number; projectsDone: number; secretsProcessed: number; lastProgressAt: string; error?: string }`
  - `advanceCursor(input: TAdvanceCursorInput): TAdvanceCursorResult`
  - `needsBackfill(row: { secretValueBlindIndex?: string | null; secretValueOrgBlindIndex?: string | null; encryptedValue?: Buffer | null }): boolean`

- [ ] **Step 1: Write the types**

```ts
export type TBackfillCursor = {
  projectId: string;
  folderId: string;
  key: string;
  id: string;
};

export type TBackfillScope = { scope: "org"; orgId: string } | { scope: "project"; projectId: string };

export type TBackfillRunState = {
  status: "running" | "failed";
  cursor: TBackfillCursor | null;
  projectsTotal: number;
  projectsDone: number;
  secretsProcessed: number;
  lastProgressAt: string;
  error?: string;
};

export type TAdvanceCursorInput = {
  cursor: TBackfillCursor | null;
  projectIds: string[];
  folderIdsByProject: Record<string, string[]>;
  lastRow: { key: string; id: string } | null;
  folderExhausted: boolean;
};

export type TAdvanceCursorResult =
  | { done: true }
  | { done: false; cursor: TBackfillCursor; completedProjectId: string | null };
```

`completedProjectId` is how the caller learns it just finished a project's last folder, which is the moment to flip that project's `secretBlindIndexEnabled`.

- [ ] **Step 2: Write the failing tests**

```ts
import { advanceCursor, needsBackfill } from "./secret-value-tracking-fns";

const PROJECTS = ["p1", "p2"];
const FOLDERS = { p1: ["f1", "f2"], p2: ["f3"] };

describe("advanceCursor", () => {
  test("a null cursor starts at the first folder of the first project", () => {
    expect(
      advanceCursor({
        cursor: null,
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: false
      })
    ).toEqual({ done: false, cursor: { projectId: "p1", folderId: "f1", key: "", id: "" }, completedProjectId: null });
  });

  test("a partly read folder advances within itself", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "f1", key: "A", id: "s1" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: { key: "B", id: "s2" },
        folderExhausted: false
      })
    ).toEqual({ done: false, cursor: { projectId: "p1", folderId: "f1", key: "B", id: "s2" }, completedProjectId: null });
  });

  test("an exhausted folder moves to the next folder of the same project", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "f1", key: "Z", id: "s9" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: true
      })
    ).toEqual({ done: false, cursor: { projectId: "p1", folderId: "f2", key: "", id: "" }, completedProjectId: null });
  });

  test("the last folder of a project reports the project complete and moves to the next project", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "f2", key: "Z", id: "s9" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: true
      })
    ).toEqual({ done: false, cursor: { projectId: "p2", folderId: "f3", key: "", id: "" }, completedProjectId: "p1" });
  });

  test("the last folder of the last project ends the walk", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p2", folderId: "f3", key: "Z", id: "s9" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: true
      })
    ).toEqual({ done: true });
  });

  // Review Focus 2: an empty folder must not leave the cursor where it was, or the walk spins.
  test("an empty folder advances rather than repeating itself", () => {
    const result = advanceCursor({
      cursor: { projectId: "p1", folderId: "f1", key: "", id: "" },
      projectIds: PROJECTS,
      folderIdsByProject: FOLDERS,
      lastRow: null,
      folderExhausted: true
    });
    expect(result).toEqual({
      done: false,
      cursor: { projectId: "p1", folderId: "f2", key: "", id: "" },
      completedProjectId: null
    });
  });

  // Review Focus 1: a project or folder deleted between chunks.
  test("a cursor on a deleted folder resumes at the next folder of that project", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "gone", key: "M", id: "s5" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: false
      })
    ).toEqual({ done: false, cursor: { projectId: "p1", folderId: "f1", key: "", id: "" }, completedProjectId: null });
  });

  test("a cursor on a deleted project resumes at the next project", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "gone", folderId: "gone", key: "M", id: "s5" },
        projectIds: PROJECTS,
        folderIdsByProject: FOLDERS,
        lastRow: null,
        folderExhausted: false
      })
    ).toEqual({ done: false, cursor: { projectId: "p1", folderId: "f1", key: "", id: "" }, completedProjectId: null });
  });

  test("a project with no folders is skipped", () => {
    expect(
      advanceCursor({
        cursor: { projectId: "p1", folderId: "f2", key: "Z", id: "s9" },
        projectIds: ["p1", "empty", "p2"],
        folderIdsByProject: { ...FOLDERS, empty: [] },
        lastRow: null,
        folderExhausted: true
      })
    ).toEqual({ done: false, cursor: { projectId: "p2", folderId: "f3", key: "", id: "" }, completedProjectId: "p1" });
  });

  test("an organization with no projects is immediately done", () => {
    expect(
      advanceCursor({ cursor: null, projectIds: [], folderIdsByProject: {}, lastRow: null, folderExhausted: false })
    ).toEqual({ done: true });
  });
});

describe("needsBackfill", () => {
  test("a row missing the org digest needs work", () => {
    expect(
      needsBackfill({ secretValueBlindIndex: "abc", secretValueOrgBlindIndex: null, encryptedValue: Buffer.from("x") })
    ).toBe(true);
  });

  test("a row missing the project digest needs work", () => {
    expect(
      needsBackfill({ secretValueBlindIndex: null, secretValueOrgBlindIndex: "abc", encryptedValue: Buffer.from("x") })
    ).toBe(true);
  });

  test("a row with both digests is skipped", () => {
    expect(
      needsBackfill({ secretValueBlindIndex: "a", secretValueOrgBlindIndex: "b", encryptedValue: Buffer.from("x") })
    ).toBe(false);
  });

  test("a row with no encrypted value is skipped even when digests are missing", () => {
    expect(needsBackfill({ secretValueBlindIndex: null, secretValueOrgBlindIndex: null, encryptedValue: null })).toBe(
      false
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `make test-api-unit SPEC=secret-value-tracking-fns`

Expected: FAIL, because `./secret-value-tracking-fns` does not exist.

- [ ] **Step 4: Write the implementation**

```ts
import { TAdvanceCursorInput, TAdvanceCursorResult, TBackfillCursor } from "./secret-value-tracking-types";

const startOfFolder = (projectId: string, folderId: string): TBackfillCursor => ({
  projectId,
  folderId,
  key: "",
  id: ""
});

// Resolves to the first project at or after the cursor's project, so a project deleted between
// chunks is stepped over rather than stalling the walk on a project that is no longer there.
const firstProjectWithFolders = (
  projectIds: string[],
  folderIdsByProject: Record<string, string[]>,
  fromIndex: number
) => {
  for (let i = fromIndex; i < projectIds.length; i += 1) {
    const projectId = projectIds[i];
    const folderIds = folderIdsByProject[projectId] ?? [];
    if (folderIds.length) return { projectId, folderId: folderIds[0] };
  }
  return null;
};

export const advanceCursor = ({
  cursor,
  projectIds,
  folderIdsByProject,
  lastRow,
  folderExhausted
}: TAdvanceCursorInput): TAdvanceCursorResult => {
  if (!cursor) {
    const next = firstProjectWithFolders(projectIds, folderIdsByProject, 0);
    if (!next) return { done: true };
    return { done: false, cursor: startOfFolder(next.projectId, next.folderId), completedProjectId: null };
  }

  const projectIndex = projectIds.indexOf(cursor.projectId);
  if (projectIndex === -1) {
    const next = firstProjectWithFolders(projectIds, folderIdsByProject, 0);
    if (!next) return { done: true };
    return { done: false, cursor: startOfFolder(next.projectId, next.folderId), completedProjectId: null };
  }

  const folderIds = folderIdsByProject[cursor.projectId] ?? [];
  const folderIndex = folderIds.indexOf(cursor.folderId);

  if (folderIndex === -1) {
    if (folderIds.length) {
      return { done: false, cursor: startOfFolder(cursor.projectId, folderIds[0]), completedProjectId: null };
    }
    const next = firstProjectWithFolders(projectIds, folderIdsByProject, projectIndex + 1);
    if (!next) return { done: true };
    return { done: false, cursor: startOfFolder(next.projectId, next.folderId), completedProjectId: null };
  }

  if (!folderExhausted && lastRow) {
    return {
      done: false,
      cursor: { projectId: cursor.projectId, folderId: cursor.folderId, key: lastRow.key, id: lastRow.id },
      completedProjectId: null
    };
  }

  if (folderIndex + 1 < folderIds.length) {
    return {
      done: false,
      cursor: startOfFolder(cursor.projectId, folderIds[folderIndex + 1]),
      completedProjectId: null
    };
  }

  const next = firstProjectWithFolders(projectIds, folderIdsByProject, projectIndex + 1);
  if (!next) return { done: true };
  return { done: false, cursor: startOfFolder(next.projectId, next.folderId), completedProjectId: cursor.projectId };
};

export const needsBackfill = (row: {
  secretValueBlindIndex?: string | null;
  secretValueOrgBlindIndex?: string | null;
  encryptedValue?: Buffer | null;
}) => Boolean(row.encryptedValue) && (!row.secretValueBlindIndex || !row.secretValueOrgBlindIndex);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `make test-api-unit SPEC=secret-value-tracking-fns`

Expected: PASS, 13 tests.

One test needs attention if it fails. "the last folder of the last project ends the walk" returns `{ done: true }` and therefore reports no `completedProjectId`, so the caller flips the final project's flag from the `done` branch rather than from the cursor. Task 5 does that.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/secret-value-tracking/
git commit -m "feat(secret-value-tracking): add the pure walk logic"
```

---

### Task 3: Run state in Redis

**Files:**
- Modify: `backend/src/keystore/keystore.ts` (add the prefix)
- Create: `backend/src/services/secret-value-tracking/secret-value-tracking-state.ts`
- Modify: `backend/src/services/secret-value-tracking/secret-value-tracking-fns.ts` (add `resolveRunStatus`)
- Test: `backend/src/services/secret-value-tracking/secret-value-tracking-fns.test.ts` (extend)

**Interfaces:**
- Consumes: `TBackfillRunState`, `TBackfillCursor` from Task 2.
- Produces:
  - `KeyStorePrefixes.SecretValueTrackingBackfill(scopeId: string): string`
  - `resolveRunStatus(state: TBackfillRunState | null, flagEnabled: boolean, now: Date): { status: JobState; message?: string }`
  - `secretValueTrackingStateFactory({ keyStore })` returning `{ read, claim, write, clear }` where
    - `read(scopeId: string): Promise<TBackfillRunState | null>`
    - `claim(scopeId: string, projectsTotal: number): Promise<boolean>`
    - `write(scopeId: string, state: TBackfillRunState): Promise<void>`
    - `clear(scopeId: string): Promise<void>`

- [ ] **Step 1: Add the key prefix and the constants**

In `backend/src/keystore/keystore.ts`, beside `InsightsCache` in `KeyStorePrefixes`:

```ts
  SecretValueTrackingBackfill: (scopeId: string) => `secret-value-tracking-backfill:${scopeId}` as const,
```

And in `KeyStoreTtls`:

```ts
  SecretValueTrackingBackfillInSeconds: 172800, // 2 days, long enough to resume a run someone retries the next day
```

- [ ] **Step 2: Write the failing tests for status resolution**

Append to `secret-value-tracking-fns.test.ts`, extending the existing import of the module under test and adding the state type:

```ts
import { JobState } from "@app/queue";

import { resolveRunStatus } from "./secret-value-tracking-fns";
import { TBackfillRunState } from "./secret-value-tracking-types";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

const running = (lastProgressAt: string): TBackfillRunState => ({
  status: "running",
  cursor: null,
  projectsTotal: 3,
  projectsDone: 1,
  secretsProcessed: 10,
  lastProgressAt
});

describe("resolveRunStatus", () => {
  test("the flag being set means completed, whatever the key says", () => {
    expect(resolveRunStatus(running(minutesAgo(1)), true, NOW)).toEqual({ status: JobState.Completed });
  });

  test("no key and no flag means the backfill was never run", () => {
    expect(resolveRunStatus(null, false, NOW)).toEqual({ status: JobState.NotFound });
  });

  test("a run that progressed recently is pending", () => {
    expect(resolveRunStatus(running(minutesAgo(1)), false, NOW)).toEqual({ status: JobState.Pending });
  });

  test("a recorded failure reports its error", () => {
    expect(
      resolveRunStatus({ ...running(minutesAgo(1)), status: "failed", error: "kms unavailable" }, false, NOW)
    ).toEqual({ status: JobState.Failed, message: "kms unavailable" });
  });

  test("a run with no progress for longer than the window is stalled", () => {
    const result = resolveRunStatus(running(minutesAgo(30)), false, NOW);
    expect(result.status).toBe(JobState.Failed);
    expect(result.message).toMatch(/stopped responding/i);
  });

  // Review Focus 4: the boundary must be decisive rather than flapping.
  test("exactly at the staleness boundary the run still counts as pending", () => {
    expect(resolveRunStatus(running(minutesAgo(15)), false, NOW)).toEqual({ status: JobState.Pending });
  });

  test("one second past the boundary the run is stalled", () => {
    const justPast = new Date(NOW.getTime() - (15 * 60_000 + 1000)).toISOString();
    expect(resolveRunStatus(running(justPast), false, NOW).status).toBe(JobState.Failed);
  });

  // Review Focus 5: an unreadable lastProgressAt must not throw into the status endpoint.
  test("an unparseable lastProgressAt reads as stalled rather than throwing", () => {
    expect(resolveRunStatus({ ...running(""), lastProgressAt: "not-a-date" }, false, NOW).status).toBe(JobState.Failed);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `make test-api-unit SPEC=secret-value-tracking-fns`

Expected: FAIL with `resolveRunStatus is not a function`.

- [ ] **Step 4: Implement status resolution**

Append to `secret-value-tracking-fns.ts`:

```ts
import { JobState } from "@app/queue";

import { TBackfillRunState } from "./secret-value-tracking-types";

export const BACKFILL_STALE_AFTER_MS = 15 * 60 * 1000;

export const resolveRunStatus = (
  state: TBackfillRunState | null,
  flagEnabled: boolean,
  now: Date
): { status: JobState; message?: string } => {
  if (flagEnabled) return { status: JobState.Completed };
  if (!state) return { status: JobState.NotFound };
  if (state.status === "failed") return { status: JobState.Failed, message: state.error ?? "Unknown error" };

  const lastProgress = new Date(state.lastProgressAt).getTime();
  if (Number.isNaN(lastProgress) || now.getTime() - lastProgress > BACKFILL_STALE_AFTER_MS) {
    return {
      status: JobState.Failed,
      message: "The backfill stopped responding. Start it again to resume from where it left off."
    };
  }

  return { status: JobState.Pending };
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `make test-api-unit SPEC=secret-value-tracking-fns`

Expected: PASS, 21 tests.

- [ ] **Step 6: Write the state module**

Create `secret-value-tracking-state.ts`. `read` must never throw on a bad payload, because it feeds the status endpoint and an unreadable key means "no run in progress", not a 500.

```ts
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

import { BACKFILL_STALE_AFTER_MS } from "./secret-value-tracking-fns";
import { TBackfillRunState } from "./secret-value-tracking-types";

type TDep = {
  keyStore: Pick<TKeyStoreFactory, "getItemPrimary" | "setItemWithExpiry" | "setItemWithExpiryNX" | "deleteItem">;
};

export const secretValueTrackingStateFactory = ({ keyStore }: TDep) => {
  const read = async (scopeId: string): Promise<TBackfillRunState | null> => {
    const raw = await keyStore.getItemPrimary(KeyStorePrefixes.SecretValueTrackingBackfill(scopeId));
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as TBackfillRunState;
      if (typeof parsed?.lastProgressAt !== "string" || typeof parsed?.status !== "string") return null;
      return parsed;
    } catch (error) {
      logger.warn(error, `Secret value tracking backfill state unreadable [scopeId=${scopeId}]`);
      return null;
    }
  };

  const write = async (scopeId: string, state: TBackfillRunState) => {
    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.SecretValueTrackingBackfill(scopeId),
      KeyStoreTtls.SecretValueTrackingBackfillInSeconds,
      JSON.stringify(state)
    );
  };

  const clear = async (scopeId: string) => {
    await keyStore.deleteItem(KeyStorePrefixes.SecretValueTrackingBackfill(scopeId));
  };

  // Claiming keeps whatever cursor a previous run left, so retrying a stalled backfill resumes
  // instead of starting the scope again.
  const claim = async (scopeId: string, projectsTotal: number) => {
    const fresh: TBackfillRunState = {
      status: "running",
      cursor: null,
      projectsTotal,
      projectsDone: 0,
      secretsProcessed: 0,
      lastProgressAt: new Date().toISOString()
    };

    const claimed = await keyStore.setItemWithExpiryNX(
      KeyStorePrefixes.SecretValueTrackingBackfill(scopeId),
      KeyStoreTtls.SecretValueTrackingBackfillInSeconds,
      JSON.stringify(fresh)
    );
    if (claimed) return true;

    const existing = await read(scopeId);
    if (!existing) {
      await write(scopeId, fresh);
      return true;
    }

    const lastProgress = new Date(existing.lastProgressAt).getTime();
    const stalled =
      existing.status === "failed" ||
      Number.isNaN(lastProgress) ||
      Date.now() - lastProgress > BACKFILL_STALE_AFTER_MS;
    if (!stalled) return false;

    await write(scopeId, {
      ...fresh,
      cursor: existing.cursor,
      projectsDone: existing.projectsDone,
      secretsProcessed: existing.secretsProcessed
    });
    return true;
  };

  return { read, write, clear, claim };
};

export type TSecretValueTrackingStateFactory = ReturnType<typeof secretValueTrackingStateFactory>;
```

- [ ] **Step 7: Type check and commit**

Run: `cd backend && npm run type:check`

Expected: exit 0.

```bash
git add backend/src/keystore/keystore.ts backend/src/services/secret-value-tracking/
git commit -m "feat(secret-value-tracking): add the backfill run state"
```

---

### Task 4: The keyset query and the relaxed update guard

**Files:**
- Modify: `backend/src/services/secret-v2-bridge/secret-v2-bridge-dal.ts:1269-1284` (replace `findProjectSecretsWithNullBlindIndex`)
- Modify: `backend/src/services/secret-v2-bridge/secret-v2-bridge-dal.ts:1305` (the update guard)

**Interfaces:**
- Consumes: nothing.
- Produces: `findSecretsInFolderAfter(folderId: string, after: { key: string; id: string }, limit: number, tx?: Knex): Promise<Pick<TSecretsV2, "id" | "key" | "encryptedValue" | "secretValueBlindIndex" | "secretValueOrgBlindIndex">[]>`, ordered by `key` then `id`.

- [ ] **Step 1: Replace the discovery query**

Delete `findProjectSecretsWithNullBlindIndex` and add:

```ts
  // Walks a folder in (key, id) order so a backfill visits every row exactly once. Ordering on the
  // pair matters: the unique index on (key, folderId) is partial on type = 'shared', so a personal
  // override shares a key with the shared secret beside it and a key-only cursor would step over it.
  const findSecretsInFolderAfter = async (
    folderId: string,
    after: { key: string; id: string },
    limit: number,
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretV2)
        .where(`${TableName.SecretV2}.folderId`, folderId)
        .whereRaw(`("${TableName.SecretV2}"."key", "${TableName.SecretV2}"."id"::text) > (?, ?)`, [after.key, after.id])
        .orderBy([
          { column: `${TableName.SecretV2}.key`, order: "asc" },
          { column: `${TableName.SecretV2}.id`, order: "asc" }
        ])
        .limit(limit)
        .select(
          db.ref("id").withSchema(TableName.SecretV2),
          db.ref("key").withSchema(TableName.SecretV2),
          db.ref("encryptedValue").withSchema(TableName.SecretV2),
          db.ref("secretValueBlindIndex").withSchema(TableName.SecretV2),
          db.ref("secretValueOrgBlindIndex").withSchema(TableName.SecretV2)
        );

      return docs as Pick<
        TSecretsV2,
        "id" | "key" | "encryptedValue" | "secretValueBlindIndex" | "secretValueOrgBlindIndex"
      >[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretsInFolderAfter" });
    }
  };
```

Export it from the factory's return object in place of `findProjectSecretsWithNullBlindIndex`.

The `id::text` cast is deliberate. `id` is a uuid and the cursor carries it as a string, so comparing the row constructor without the cast makes Postgres compare a uuid against text and fail. Casting on both sides of the comparison keeps the ordering consistent with the `ORDER BY`, which also sorts uuid as text under this cast, so the walk stays total.

- [ ] **Step 2: Relax the update guard**

At `secret-v2-bridge-dal.ts:1305`, change the trailing condition of the `batchSetBlindIndexes` raw query:

```ts
        WHERE ${TableName.SecretV2}.id = v.id
          AND (${TableName.SecretV2}."secretValueBlindIndex" IS NULL
               OR ${TableName.SecretV2}."secretValueOrgBlindIndex" IS NULL)
```

The guard exists to avoid overwriting a row a live write changed between the backfill's read and its write. Every live write sets both digests, so the relaxed guard still skips any row a live write has touched; the only rows it now lets through are ones written before one of the digests existed, and nothing is concurrently writing those.

- [ ] **Step 3: Fix the one caller so the build passes**

`backend/src/services/project/project-queue.ts` references `findProjectSecretsWithNullBlindIndex` in its dependency `Pick` and in the job body. Task 5 removes that job entirely. For this task, narrow the `Pick` to `"batchSetBlindIndexes"` and leave the job body compiling by deleting the `findProjectSecretsWithNullBlindIndex` call together with the job, which Task 5 then rebuilds elsewhere.

If that is too large a step to keep the build green in one commit, do Task 4 and Task 5 as a single commit. They are split here only because their tests differ.

- [ ] **Step 4: Type check**

Run: `cd backend && npm run type:check`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/secret-v2-bridge/secret-v2-bridge-dal.ts backend/src/services/project/project-queue.ts
git commit -m "refactor(secret-value-tracking): walk secrets by cursor instead of scanning for nulls"
```

---

### Task 5: The chunked job

**Files:**
- Create: `backend/src/services/secret-value-tracking/secret-value-tracking-queue.ts`
- Modify: `backend/src/queue/queue-service.ts:623-626` (the payload)
- Modify: `backend/src/services/project/project-queue.ts` (remove the job, `startSecretBlindIndexMigration`, `getJobState`)

**Interfaces:**
- Consumes: `advanceCursor`, `needsBackfill`, `TBackfillScope`, `TBackfillCursor` (Task 2), `secretValueTrackingStateFactory` (Task 3), `findSecretsInFolderAfter`, `batchSetBlindIndexes` (Task 4).
- Produces: `secretValueTrackingQueueFactory(dep)` returning `{ startBackfill(scope: TBackfillScope): Promise<void> }`. It takes no project count, because the service has already written that into the Redis key when it claimed the run.

- [ ] **Step 1: Widen the queue payload**

In `backend/src/queue/queue-service.ts`:

```ts
  [QueueName.SecretBlindIndexMigration]: {
    name: QueueJobs.SecretBlindIndexMigration;
    // `scope` is absent on jobs queued before the org-wide walk shipped; the handler reads those as
    // project scope so a deploy does not strand them.
    payload: { scope: "org"; orgId: string } | { scope: "project"; projectId: string } | { projectId: string };
  };
```

- [ ] **Step 2: Write the job**

Create `secret-value-tracking-queue.ts`. The factory dependencies are:

```ts
type TDep = {
  queueService: TQueueServiceFactory;
  keyStore: Pick<TKeyStoreFactory, "getItemPrimary" | "setItemWithExpiry" | "setItemWithExpiryNX" | "deleteItem" | "deleteItems">;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById" | "updateById">;
  orgDAL: Pick<TOrgDALFactory, "updateById">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findSecretsInFolderAfter" | "batchSetBlindIndexes">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};
```

Constants:

```ts
const CHUNK_SIZE = 5000;
const READ_BATCH_SIZE = 1000;
```

Behaviour, in order:

1. Read the scope from the payload. A payload with no `scope` is project scope.
2. `scopeId` is the `orgId` for org scope and the `projectId` for project scope. It keys the Redis state.
3. Read the run state. If there is none, stop: the run was cleared or expired, and a chunk with no state has nothing to resume.
4. Resolve the project list. For org scope, `projectDAL.find({ orgId, type: ProjectType.SecretManager })` sorted by `id`. For project scope, the single project, and `orgId` comes from it.
5. Resolve the folder list per project with `folderDAL.findByProjectId`, sorted by `id`. Fetch it lazily, only for the projects the walk touches in this chunk.
6. Loop until `CHUNK_SIZE` secrets have been read or the walk is done:
   - Resolve the current cursor with `advanceCursor` when there is none, or use the stored one.
   - Read up to `READ_BATCH_SIZE` rows with `findSecretsInFolderAfter(cursor.folderId, { key: cursor.key, id: cursor.id }, READ_BATCH_SIZE)`.
   - `folderExhausted` is `rows.length < READ_BATCH_SIZE`.
   - Filter with `needsBackfill`, decrypt each survivor, compute both digests with the indexer, and call `batchSetBlindIndexes`.
   - Advance the cursor with `advanceCursor`, passing the last row read.
   - When the result carries a `completedProjectId`, set `projectDAL.updateById(completedProjectId, { secretBlindIndexEnabled: true })` and increment `projectsDone`.
7. The cipher pair is resolved once per project encountered, not once per batch, with `createSecretBlindIndexer({ projectId, orgId, kmsService })`. Cache it in a `Map` keyed by `projectId` for the life of the chunk. This is why the chunk is 5000 rather than the read batch size: on external KMS each resolve is a network call.
8. On `done`, flip the final project's flag too, then for org scope set `orgDAL.updateById(orgId, { orgWideSecretValueTrackingEnabled: true })` and for project scope set the project's own flag. Clear the Redis key. Delete the insights duplication cache with `keyStore.deleteItems({ pattern: `${KeyStorePrefixes.InsightsCache(projectId, "secrets-duplication")}*` })` for each project the walk completed, which is what the job does today.
9. Otherwise write the advanced state with a fresh `lastProgressAt` and queue the successor.

The successor's job id must be unique per chunk, because BullMQ ignores an add for an id that is currently active, so a fixed id would break the chain at the second chunk:

```ts
    const jobId = `secret-value-tracking-${scopeId}-${Date.now()}`;
```

Register the `failed` listener so an exhausted retry is visible on the status endpoint rather than only in the logs:

```ts
  queueService.listen(QueueName.SecretBlindIndexMigration, "failed", (job, err) => {
    const scopeId = resolveScopeId(job?.data);
    logger.error(err, `SecretValueTrackingBackfill: failed [scopeId=${scopeId}]`);
    if (!scopeId) return;
    void state.read(scopeId).then((existing) => {
      if (!existing) return undefined;
      return state.write(scopeId, { ...existing, status: "failed", error: err.message });
    });
  });
```

Start the queue with the pacing on the queue rather than in the loop, and drop the 100 to 200ms sleep the old job used between batches:

```ts
  queueService.start(QueueName.SecretBlindIndexMigration, handler, {
    concurrency: 1,
    limiter: { max: 1, duration: 1000 }
  });
```

`startBackfill(scope)` queues the first chunk. It does not claim the Redis key; the service does that before calling, so a refused claim never queues anything.

A project or folder that vanished is handled entirely by `advanceCursor`, so the job body needs no special case for it.

- [ ] **Step 3: Remove the old job**

Delete `startSecretBlindIndexMigration`, the `queueService.start(QueueName.SecretBlindIndexMigration, ...)` block, its `failed` listener, and `getJobState` from `project-queue.ts`, along with the now unused imports (`createSecretBlindIndexer`, `KmsDataKey` if unused elsewhere in that file, `JobState`). Remove them from the factory's return object. `queueService.start` must be called once per queue name, so leaving both would register two workers on one queue.

- [ ] **Step 4: Type check**

Run: `cd backend && npm run type:check`

Expected: FAIL, naming `project-service.ts` where `projectQueue.startSecretBlindIndexMigration` and `projectQueue.getJobState` no longer exist. Task 6 fixes those call sites.

- [ ] **Step 5: Commit**

Commit with Task 6, since the build is not green on its own.

---

### Task 6: The service, the routes, and the wiring

**Files:**
- Create: `backend/src/services/secret-value-tracking/secret-value-tracking-service.ts`
- Modify: `backend/src/services/project/project-service.ts:2361-2409` (delegate)
- Modify: `backend/src/server/routes/v1/organization-router.ts` (two routes)
- Modify: `backend/src/server/routes/index.ts` (wiring)
- Modify: `backend/src/ee/services/audit-log/audit-log-types.ts` (the event)
- Modify: `backend/src/@types/fastify.d.ts` (the service on `server.services`)

**Interfaces:**
- Consumes: `secretValueTrackingQueueFactory` (Task 5), `secretValueTrackingStateFactory` and `resolveRunStatus` (Task 3).
- Produces: `secretValueTrackingServiceFactory(dep)` returning
  - `enableForOrg(actor: OrgServiceActor): Promise<{ projectsTotal: number }>` (the count travels back so the route can record it on the audit event)
  - `getOrgStatus(actor: OrgServiceActor): Promise<{ status: JobState; message?: string; projectsTotal: number; projectsDone: number; secretsProcessed: number }>`
  - `enableForProject(dto: TProjectPermission): Promise<void>`
  - `getProjectStatus(dto: TProjectPermission): Promise<{ status: JobState; message?: string; projectsTotal: number; projectsDone: number; secretsProcessed: number }>`

- [ ] **Step 1: Write the service**

`enableForOrg`:
1. `ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings)` using `permissionService.getOrgPermission`.
2. Read the org with `orgDAL.findById(actor.orgId)`. Throw `NotFoundError` when missing.
3. Throw `BadRequestError` with `"Org-wide secret value tracking is already enabled for this organization"` when the flag is set, matching how `enableSecretBlindIndex` refuses.
4. Count projects: `(await projectDAL.find({ orgId: actor.orgId, type: ProjectType.SecretManager })).length`. Do not count secrets.
5. `const claimed = await state.claim(actor.orgId, projectsTotal)`. When false, throw `BadRequestError` with `"A backfill is already running for this organization"`.
6. `await queue.startBackfill({ scope: "org", orgId: actor.orgId })` and return `{ projectsTotal }`.

`getOrgStatus` reads the org flag and the state, returns `resolveRunStatus(state, org.orgWideSecretValueTrackingEnabled, new Date())` spread with `projectsTotal`, `projectsDone` and `secretsProcessed` from the state, defaulting to `0` when there is no state.

`enableForProject` and `getProjectStatus` keep the permission checks that `project-service.ts` uses today (`ProjectPermissionActions.Edit` on `ProjectPermissionSub.Settings` via `getProjectPermission` with `actionProjectType: ActionProjectType.SecretManager`), gate on `projects.secretBlindIndexEnabled`, and use the project id as the scope id. `projectsTotal` is `1`.

- [ ] **Step 2: Add the audit event**

In `backend/src/ee/services/audit-log/audit-log-types.ts`, beside `UPDATE_ORG`:

```ts
  ENABLE_ORG_WIDE_SECRET_VALUE_TRACKING = "enable-org-wide-secret-value-tracking",
```

```ts
interface EnableOrgWideSecretValueTrackingEvent {
  type: EventType.ENABLE_ORG_WIDE_SECRET_VALUE_TRACKING;
  metadata: {
    projectsTotal: number;
  };
}
```

Add `| EnableOrgWideSecretValueTrackingEvent` to the `Event` union.

- [ ] **Step 3: Write the routes**

In `backend/src/server/routes/v1/organization-router.ts`, which is registered under the `/organization` prefix:

```ts
  server.route({
    method: "POST",
    url: "/secret-value-tracking",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      operationId: "enableOrgWideSecretValueTracking",
      description: "Start the backfill that makes every secret value in the organization searchable",
      security: [{ bearerAuth: [] }],
      response: { 200: z.object({ message: z.string() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectsTotal } = await server.services.secretValueTracking.enableForOrg(req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.ENABLE_ORG_WIDE_SECRET_VALUE_TRACKING,
          metadata: { projectsTotal }
        }
      });

      return { message: "Successfully started org-wide secret value tracking" };
    }
  });

  server.route({
    method: "GET",
    url: "/secret-value-tracking/status",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "getOrgWideSecretValueTrackingStatus",
      description: "Report progress of the org-wide secret value tracking backfill",
      security: [{ bearerAuth: [] }],
      response: {
        200: z.object({
          status: z.nativeEnum(JobState),
          message: z.string().optional(),
          projectsTotal: z.number(),
          projectsDone: z.number(),
          secretsProcessed: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => server.services.secretValueTracking.getOrgStatus(req.permission)
  });
```

The enable route is `AuthMode.JWT` only. It is an organization settings write, which `backend/CLAUDE.md` says does not take a delegated OAuth token; the status read does.

- [ ] **Step 4: Delegate the project path**

In `project-service.ts`, replace the bodies of `enableSecretBlindIndex` and `getSecretBlindIndexMigrationStatus` with calls to `secretValueTrackingService.enableForProject` and `.getProjectStatus`. Keep the exported names so `project-router.ts` is untouched.

- [ ] **Step 5: Wire it**

In `backend/src/server/routes/index.ts`, construct the state, queue, and service factories after `secretV2BridgeDAL` and `folderDAL` exist, pass `secretValueTrackingService` into `projectServiceFactory`, and add `secretValueTracking: secretValueTrackingService` to the `server.decorate("services", {...})` object. Declare it on `TSecretValueTrackingServiceFactory` in `backend/src/@types/fastify.d.ts`.

- [ ] **Step 6: Type check and lint**

Run: `cd backend && npm run type:check && npm run lint:fix`

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(secret-value-tracking): backfill a whole org from one chunked job"
```

---

### Task 7: Gate secret value search

**Files:**
- Modify: `backend/src/services/secret-v2-bridge/secret-v2-bridge-service.ts` (`findSecretsByValue`)

**Interfaces:**
- Consumes: `organizations.orgWideSecretValueTrackingEnabled` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Add the gate**

`findSecretsByValue` already takes `actor: OrgServiceActor` and the factory already has `orgDAL` with `findOrgById`. Add `"findById"` to that `Pick` and read the org first, before any other work:

```ts
    const org = await orgDAL.findById(actor.orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${actor.orgId}' not found` });

    if (!org.orgWideSecretValueTrackingEnabled) {
      throw new BadRequestError({
        message:
          "Enable org-wide secret value tracking for this organization before searching for a secret by its value"
      });
    }
```

Use `findById` rather than `findOrgById`: `findOrgById` takes no `tx` and reads from `db.replicaNode()`, which is the deadlock trigger `CODE_QUALITY.md` warns about if this ever moves inside a transaction.

Both scopes are gated, project scope included, because both match on the organization digest.

- [ ] **Step 2: Type check**

Run: `cd backend && npm run type:check`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/secret-v2-bridge/secret-v2-bridge-service.ts
git commit -m "feat(secret-value-tracking): gate secret value search on org completion"
```

---

### Task 8: End to end

**Files:**
- Create: `backend/e2e-test/routes/v1/org-secret-value-tracking.spec.ts`
- Modify: `backend/e2e-test/routes/v3/secrets-management.spec.ts` (enable tracking before the search tests)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Unblock the existing search suite**

`createIsolatedOrgAndProject` makes a fresh organization, which the migration defaults to tracking enabled, so `secrets-management.spec.ts` should keep passing untouched. Run it first to confirm:

Run: `make test-api-e2e SPEC=secrets-management`

Expected: PASS, 11 tests. If it fails with the gate's message, the migration's default for new rows is wrong and Task 1 needs revisiting before going further.

- [ ] **Step 2: Write the failing e2e spec**

Create `org-secret-value-tracking.spec.ts`. It uses `createIsolatedOrgAndProject` from `e2e-test/testUtils/fixtures`, the secret helpers from `e2e-test/testUtils/secrets`, and `testServer.inject`.

Cover, in this order:

```ts
const enable = (authToken: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/organization/secret-value-tracking",
    headers: { authorization: `Bearer ${authToken}` }
  });

const status = async (authToken: string) => {
  const res = await testServer.inject({
    method: "GET",
    url: "/api/v1/organization/secret-value-tracking/status",
    headers: { authorization: `Bearer ${authToken}` }
  });
  expect(res.statusCode).toBe(200);
  return res.json() as { status: string; projectsTotal: number; projectsDone: number; secretsProcessed: number };
};
```

- "a new organization is already tracking" asserts `status` is `completed` and that `enable` returns 400 with the already-enabled message.
- "a search refuses while tracking is off" flips the flag off directly through the org update route or a DAL call in the test setup, asserts the search returns 400 naming org-wide secret value tracking, then re-enables and asserts the search works again.
- "the backfill fills a secret whose org digest was cleared" is the case the whole feature exists for. Create a secret, null its `secretValueOrgBlindIndex` and the org flag, run `enable`, poll `status` until `completed` (with a timeout well inside the suite's `vi.setConfig` budget), then assert the value is findable through `POST /api/v4/secrets/search-by-value`.
- "a second enable while a run is moving is refused" asserts the 400.

Writing to the database directly is acceptable here only for *setup*, to manufacture the incomplete state that a fresh test organization cannot otherwise have. Every assertion goes through the API.

Set `vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })` at the top of the describe, because the walk is a queue round trip.

- [ ] **Step 3: Run it to verify it fails**

Run: `make test-api-e2e SPEC=org-secret-value-tracking`

Expected: FAIL on the first assertion that exercises something not yet correct.

- [ ] **Step 4: Fix what it finds, then run again**

Run: `make test-api-e2e SPEC=org-secret-value-tracking`

Expected: PASS.

- [ ] **Step 5: Run the wider suites that touch this code**

Run: `make test-api-unit SPEC=secret-value-tracking && make test-api-e2e SPEC=secrets-management && make test-api-e2e SPEC=folder`

Expected: all PASS. `folder` covers the rollback path that copies digests off version rows, and `secrets-management` covers the search.

- [ ] **Step 6: Run the full review gate**

Run: `make reviewable-api`

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/e2e-test/
git commit -m "test(secret-value-tracking): cover the org backfill end to end"
```

---

## Notes for the implementer

- `backend/CODE_QUALITY.md` applies to every task. The two items most likely to bite here are transaction discipline (the walk must never hold a transaction across a KMS call) and error messages a user can act on.
- The walk reads rows that already carry both digests and skips them in code. That is intentional and is not a bug to optimise away: it is what lets the walk use an index that already exists instead of adding one whose only purpose is the migration.
- Do not add a Postgres index for the backfill. That was considered and rejected, because a user-triggered backfill never tells us when it is safe to drop the index again.
