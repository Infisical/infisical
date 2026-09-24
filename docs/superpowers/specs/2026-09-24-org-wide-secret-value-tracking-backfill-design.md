# Org-wide secret value tracking backfill

## Context

`secrets_v2` carries two digests of a secret's value. `secretValueBlindIndex` is keyed by the
project's KMS data key, so it can only answer questions inside one project.
`secretValueOrgBlindIndex` is keyed by the org's data key, so equal values anywhere in an org
produce equal digests. Every writer computes both on every create and update.

Neither column is filled for rows written before its digest existed. Projects have a
user-triggered backfill for the project digest (`startSecretBlindIndexMigration` in
`backend/src/services/project/project-queue.ts`), gated behind
`projects.secretBlindIndexEnabled`, and the product asks the user to enable it when they reach
for a feature that needs it (duplicate detection in insights, and reuse rules in
`secret-validation-rule-service.ts`).

Secret value search (`POST /api/v4/secrets/search-by-value`) needs the same treatment one level
up. It matches on the org digest, so it can only be trusted once every row in the org has one.
Answering "this value is used nowhere" from a half-filled index is the worst possible answer for
someone chasing a leaked credential, so the feature has to be blocked until the org is complete
rather than allowed to return a partial result.

This design repurposes the project backfill into one job that can walk either scope, adds the
org-level enable and status endpoints to sit beside the project pair, and gates the search on
org completion.

## What we are building

1. One walking job that backfills both digests, over either a single project or a whole org.
2. An org-level enable endpoint and a status endpoint, mirroring the project pair.
3. `organizations.orgWideSecretValueTrackingEnabled`, the durable flag the search gates on.
4. A Redis key holding the run's transient state: status, cursor, progress, and last progress
   time.
5. Secret value search refusing with a message naming what to enable, until that flag is set.

## The walk

### One predicate, two scopes

The job's unit of work is "this row is missing at least one digest". That single predicate is
what lets one job body serve both scopes, because we always compute both digests anyway and the
scope is only a filter on which rows we visit.

Two places have to change for that to be true, and skipping either one makes the org backfill a
no-op on exactly the projects it exists for:

- The row is worth working on when `secretValueBlindIndex IS NULL OR secretValueOrgBlindIndex IS
  NULL`. A project that already ran the project backfill has a project digest on every row and no
  org digest, so a predicate that only looks at the project digest finds nothing there.
- The update guard in `batchSetBlindIndexes` (`secret-v2-bridge-dal.ts`) has to match, for the
  same reason. It currently guards `AND "secretValueBlindIndex" IS NULL`.

Relaxing that guard is safe. It exists to avoid clobbering a row that a live write changed
between our read and our write, and every live write sets both digests, so the relaxed guard
still skips any row a live write has touched. The only rows that match are ones written by code
that predates one of the digests, and nothing is concurrently writing those.

### Keyset pagination over an index we already have

`findProjectSecretsWithNullBlindIndex` asks "give me rows in this project with no digest, limit
N". Postgres can use the leading column of `idx_secrets_v2_folder_id_key` to reach the project's
rows, but the `IS NULL` filter has no index behind it, so it is applied per row after the fetch.
That is tolerable once. The problem is that the job re-runs the same query for every batch, so
each batch re-reads and discards everything the previous batches already filled, and the last
batch reads most of the project to find a handful of rows.

We replace it with a cursor walk over the index that already exists:

```sql
SELECT id, "encryptedValue", "secretValueBlindIndex", "secretValueOrgBlindIndex"
FROM secrets_v2
WHERE "folderId" = ? AND ("key", id) > (?, ?)
ORDER BY "key", id
LIMIT ?
```

Every row is visited exactly once for the whole backfill, through an index range scan, and no new
Postgres index is needed. Rows that already carry both digests are skipped in code before we
decrypt anything, so the only cost they add is the read.

Ordering on `(key, id)` rather than `key` alone is load-bearing. The unique index on
`(key, folderId)` is partial (`WHERE type = 'shared'`), so a personal override shares a key with
the shared secret in the same folder, and a key-only cursor would step over it.

The walk nests three levels:

- Projects in the org, from `projectDAL.find({ orgId, type: SecretManager })`, ordered by id.
- Folders in the project, from `folderDAL.findByProjectId`, ordered by id.
- Rows in the folder, by the keyset query above.

The cursor is `{ projectId, folderId, key, id }`. When a folder runs out we move to the next
folder id, when a project runs out we flip that project's `secretBlindIndexEnabled` and move to
the next project, and when the projects run out the run is complete.

### Chunking

One job processes up to `CHUNK_SIZE` secrets (5000, read in database batches of 1000), writes the
advanced cursor to Redis, and queues its successor. If there is nothing left it sets the durable
flag and deletes the key instead.

Chunking at 5000 rather than at the database batch size is about the KMS round trips.
`createSecretBlindIndexer` resolves a project data key and an org data key once per job, and for
an org on external KMS each of those is a network call, so a job per 1000 rows would pay that
five times as often for no benefit.

The queue runs at `concurrency: 1` with a limiter. That, rather than job length, is what keeps a
long backfill from crowding out other work: the walk can never hold more than one worker slot no
matter how many secrets an org has.

The existing queue name stays. The payload widens to a discriminated union:

```ts
{ scope: "org"; orgId: string } | { scope: "project"; projectId: string }
```

A payload arriving with no `scope` is treated as project scope, so jobs already queued in the old
shape survive the deploy.

## State

### The durable flag

`organizations.orgWideSecretValueTrackingEnabled`, boolean, not null.

The migration follows the one that added the project flag
(`20260604100000_add-secret-blind-index-enabled-to-project.ts`): default true for new rows, then
one update setting every existing org to false. New orgs are complete by construction, since
every secret they ever write carries both digests, so they should never be asked to run a
backfill.

The name deliberately does not say "blind index". The org schema should describe the capability
rather than the mechanism, which is the point lobocv raised in review on #8278.

### The Redis key

`KeyStorePrefixes.OrgSecretValueTrackingBackfill(orgId)`, holding JSON:

```ts
{
  status: "running" | "failed";
  cursor: { projectId: string; folderId: string; key: string; id: string } | null;
  projectsTotal: number;
  projectsDone: number;
  secretsProcessed: number;
  lastProgressAt: string;   // ISO
  error?: string;
}
```

There is no `completed` status, because completion is the durable flag and we do not want two
answers to the same question. The final chunk sets the flag and deletes the key.

The key has a 2 day TTL, refreshed on every chunk. The long TTL is for the cursor: someone who
notices a failure the next morning can retry and resume where the run stopped, rather than start
the org again.

`projectsTotal` is counted once when the run is enabled. We deliberately do not count secrets.
Counting them is itself an expensive read on exactly the orgs where a progress bar would matter,
and the number is stale the moment we have it, so progress reads as "project 3 of 12, 47,000
secrets processed" instead of a percentage. Projects created or deleted mid-walk make
`projectsDone / projectsTotal` drift a little, which is fine for a progress display.

### Why the guard reads lastProgressAt, not the key

The key does three jobs, and they want different timeouts. The cursor and the status want the
2 days. The guard that stops a second run starting wants a short window, because a worker that
died would otherwise lock the org out of retrying for two days, which is the opposite of what
somebody staring at a stuck progress bar wants.

So the guard reads `lastProgressAt`. Progress inside the last 15 minutes means a run is genuinely
moving and the enable is refused. Anything older is treated as dead, and the enable takes over,
resuming from the cursor still in the key.

That window only covers a worker disappearing without BullMQ noticing (eg a pod killed
mid-chunk). The ordinary failure is faster: the queue's `failed` listener writes
`status: "failed"` and the error into the key, so the status endpoint reports it immediately.

## API

Both routes sit in `backend/src/server/routes/v1/organization-router.ts`, beside the project pair
in `project-router.ts`.

### Enable

`POST /api/v1/organization/secret-value-tracking`

Requires `OrgPermissionActions.Edit` on `OrgPermissionSubjects.Settings`. Refuses with a
`BadRequestError` when the flag is already set, matching `enableSecretBlindIndex`. Counts the
org's projects, claims the Redis key, queues the first chunk, and writes an audit event.

Claiming the key is `setItemWithExpiryNX` when there is no key, and a plain overwrite that keeps
the existing cursor when the key is there but stale. Two people pressing the button at the same
instant could both get through the stale branch, which costs a duplicated chunk and nothing else,
since the writes are idempotent and the guard then holds for the rest of the run.

### Status

`GET /api/v1/organization/secret-value-tracking/status`

Returns `{ status, projectsTotal, projectsDone, secretsProcessed, message? }` where status is the
existing `JobState` enum. It is resolved without touching BullMQ:

- flag set, so `Completed`
- key present and `status: "failed"`, so `Failed` with the error
- key present and `lastProgressAt` within 15 minutes, so `Pending`
- key present and older than that, so `Failed` with a stalled message
- no key and no flag, so `NotFound`

This is also worth carrying back to the project pair eventually, whose status today is only as
durable as Redis and answers from BullMQ job state. That is out of scope here.

## Gating secret value search

`findSecretsByValue` in `secret-v2-bridge-service.ts` reads the org flag first and throws when it
is not set:

```
Enable org-wide secret value tracking for this organization before searching for a secret by its
value
```

Both scopes are gated on the org flag, including project scope, because both match on the org
digest.

This follows `$assertBlindIndexingAvailable` in `secret-validation-rule-service.ts`, which is how
the product already tells someone that a feature needs a backfill they have not run.

## What changes in existing code

- `secret-v2-bridge-dal.ts`: replace `findProjectSecretsWithNullBlindIndex` with the keyset query
  above, and relax the guard in `batchSetBlindIndexes`.
- `project-queue.ts`: the job body becomes the walk, driven by the cursor. The project path uses
  the same walk with the project-scoped payload, so the repeated scan goes away for projects too.
  The 100 to 200ms pause between batches goes, since the queue limiter shapes the load now.
- `project-service.ts`: `enableSecretBlindIndex` keeps its shape. The new org service method sits
  next to it.
- `secret-v2-bridge-service.ts`: the gate in `findSecretsByValue`.
- A migration for the org column.

The piece worth extracting for its own sake is cursor advancement. Deciding "given this cursor,
this project list, this folder list and the rows we just read, where does the walk go next" is
pure, and pulling it out of the job body is what makes it testable without a database, including
the awkward cases (a folder emptied since the last chunk, a project deleted mid-walk, the last
folder of the last project).

## Failure and recovery

- A chunk throws, so BullMQ retries it. The cursor is in Redis rather than the payload, so the
  retry resumes at the same place instead of redoing work.
- The retries are exhausted, so the `failed` listener records the error in the key. The user sees
  it on the status endpoint and can retry, which resumes from the cursor.
- The worker dies, so nothing records anything. The key goes stale, the status endpoint reports
  the run as stalled after 15 minutes, and the enable endpoint accepts a retry that resumes from
  the cursor.
- The key expires after 2 days, so the org reads as never enabled and a retry restarts the walk
  from the first project. That costs a read pass, not re-work, because filled rows are skipped
  before we decrypt.
- A project or folder in the cursor is deleted between chunks, so the walk steps past it and
  carries on. It must not throw.

Secrets written during a run never need the walk to find them, because live writes already carry
both digests. So a row inserted behind the cursor being skipped is correct, not a hole.

## Testing

- Unit, on the extracted cursor advancement: moving through folders, moving through projects,
  a deleted project or folder, an emptied folder, and the end of the walk.
- Unit, on the status resolution: each of the five states above, including the staleness
  boundary.
- E2E: enable an org, poll status to completion, confirm search works afterwards and refuses with
  the named message before. Cover a project that already ran the project backfill, which is the
  case the predicate change exists for, and confirm the walk gives it org digests.
- E2E: a second enable while a run is moving is refused, and one after the staleness window is
  accepted.

## Out of scope

- The UI for either endpoint, and the search UI that will call them.
- Reworking the project status endpoint to read from Redis rather than BullMQ, though the org one
  shows what it would look like.
- Caching the org KMS data key, which is the larger performance item already noted on #8278.
- Personal secrets keep being given digests, as they are today, even though search filters them
  out. Changing that is a separate decision.
- The write-path trim on `secretValue`, which means a padded value is stored and found trimmed.
