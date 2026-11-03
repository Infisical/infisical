---
name: backend-review
description: Review a backend change in this repository (anything under backend/, or backend-go/ for the Go server) the way Infisical's backend reviewers do. Use when asked to review a backend diff or pull request, to self-review backend work before opening or pushing a PR, or when a task says "review", "check", or "is this ready" about API routes, services, DALs, migrations, queues, permissions, or audit events. Covers the house rules in backend/CODE_QUALITY.md plus the patterns reviewers keep flagging that the guide does not spell out, such as legacy project IDs, existence checks that leak data, query weight, legacy endpoint behavior, and side effects around transactions.
---

# Backend review

This skill tells you how to review a backend change. It does not replace the two documents
that hold the rules:

- **`backend/CODE_QUALITY.md`**: the floor every change must clear (errors, input validation,
  external pagination, deadlocks, REST shape, audit events, license checks).
- **`backend/AGENTS.md`**: where code goes and which existing pattern to follow (DAL, permissions,
  request memoization, queues, cron, event outbox, soft delete, client disconnects, audit text).

**Read all of `backend/CODE_QUALITY.md` before you start.** It is short and it changes. Then read
the `backend/AGENTS.md` sections for the areas the diff touches; the table in step 2 says which.
Don't review from memory of either file.

[references/review-lessons.md](references/review-lessons.md) holds what human and bot reviewers
actually flagged on recent backend PRs, with links. Read it once per session. It is where the
house exceptions live (for example, why `projectId` is not `.uuid()`), and it shows the level of
detail a finding needs.

## 1. Understand the change before judging it

1. Read the PR description and linked issue. Write down, in one sentence, what behavior the change
   is supposed to add or fix. Every finding is measured against that sentence.
2. List every changed file first (`git diff --stat origin/main...HEAD`), so changes to `tests/`,
   `backend/e2e-test/`, docs, and the frontend that ships with the backend change are not missed.
   Then focus on `backend/`, `backend-go/`, and the tests that cover them, and read every changed
   file in full, not only the hunks. Most real bugs sit in the unchanged lines around a
   hunk: the transaction the new call runs inside, the caller that now gets a different error.
3. For each new or changed function, find its callers (`rg -n "functionName\("`). A change that is
   correct for the new route can break an old route that shares the service method.
4. Trace the request path end to end: route, `verifyAuth` modes, permission check, service,
   DAL queries, transaction boundary, side effects (queue, outbox, audit log, cache, external API).

## 2. Map the diff to the areas you must check

| The diff touches | Check | Read in `backend/AGENTS.md` |
| --- | --- | --- |
| A route file (`server/routes/`, `ee/routes/`) | 3.1, 3.2, 3.3 | Route Handler Pattern, Auth System |
| A service that reads or writes the DB | 3.4, 3.5 | DAL Layer, Request-Scoped Memoization |
| `transaction(` or a `tx` / `trx` parameter | 3.4 | (CODE_QUALITY.md, deadlocks) |
| `permissionService`, CASL, roles, privileges | 3.2 | Permission System (CASL) |
| Queue, cron, outbox, webhook, sync, email | 3.6 | Queue System, Scheduled Jobs, Event Outbox |
| An audit event | 3.7 | Free Text in Audit Events, Audit Log Event Classes |
| A migration or `db/schemas` | 3.8 | Database, Soft-Delete + Async Cleanup |
| Redis cache, `withCache`, fingerprints | 3.5 | Permission System (cache paragraphs) |
| `package.json` or a dependency bump | 3.9 | Root `AGENTS.md`, Dependency Policy |
| `getPlan()` or a license feature | CODE_QUALITY.md, License Checks | Enterprise (EE) Features |
| Approvals, alerts, object storage | Root `AGENTS.md` sections of the same name | The module's own `AGENTS.md` |
| `backend-go/` | 3.2 to 3.8 apply as written | `backend-go/AGENTS.md` instead |

## 3. What to check

Each item below is a question to answer with evidence from the code, not a box to tick.

### 3.1 API contract

- Does every input field have a bound and, where relevant, a character set? Are shared schemas
  reused (`slugSchema`, `GenericResourceNameSchema`, `SecretNameSchema`, `auditSafeText`)? Is every
  `.max()` matched to the real column width (`varchar(255)` means `.max(255)`)?
- **`projectId` is the exception to "IDs are `.uuid()`".** `projects.id` is `varchar(36)`
  (`ProjectsSchema.id` is a plain `z.string()`), and projects migrated from MongoDB have non-UUID IDs,
  so `.uuid()` on `projectId` locks those customers out. Use `z.string().trim()` with a bound. Other
  IDs (`orgId`, folder, secret, approval IDs) are real UUIDs and do get `.uuid()`. Check the column
  in `src/db/schemas/` when unsure.
- Does tightening validation, changing a status code, an error class, a default, or a field name
  touch an **existing** endpoint? That is a breaking change. It needs a new version, or it must keep
  the old accepted set (a v1 slug regex replaced by a stricter shared schema breaks callers that
  already have `foo--bar`, and blocks unrelated edits of those rows).
- Can a partial update tell "field omitted" from "field set to empty"? An omitted `secretMetadata`
  that becomes `[]` somewhere downstream deletes the stored metadata.
- Is the URL resource-shaped (`/secrets/key-exists`, not `/check-duplicate-secret-name`)? Is the
  status code right (201 on create)? Is the response a deliberate `.pick()` or dedicated schema,
  never a DB row schema passed through whole?
- Is the route public or private? A private route (`hide: true`, called only by our frontend) does
  not need public API-docs constants or a docs page, and reviewers ask for those to be removed. A
  public route needs `operationId` and `.describe()` on every field.
- Are the `verifyAuth([...])` modes only the ones that genuinely need the route? A frontend-only
  route usually needs `AuthMode.JWT` (and OAuth where relevant), not identity access tokens. Never
  add `API_KEY` or `SERVICE_TOKEN`.
- Is `rateLimit` sized for how the client calls it? A route the UI calls per keystroke or per
  environment can exhaust `readLimit` in a minute. Check what the client does on 429: a
  `.catch(() => false)` silently turns "rate limited" into "no conflict".

### 3.2 Permissions and data exposure

- Does the permission check run before any data is read that depends on it, for every resource the
  caller names (project, environment, folder path), not just the first one?
- Does the response or the error reveal something the caller cannot read? Existence checks are the
  classic leak: "this key already exists in `production`" tells a user who cannot read
  `production` that it exists. Filter the answer to what the caller can see, and make sure a user
  without access to one path can still use the feature on the paths they can access. Think about
  the support ticket the restriction will create.
- A resource in another org or project returns `NotFoundError`, not `ForbiddenRequestError`.
- RBAC denials go through CASL (`ForbiddenError.from(permission).throwUnlessCan(...)`) so the denial
  is audited. `ForbiddenRequestError` is for refusals that are not about a permission.
- Org-scoped products (PAM, Agent Vault, Cert Manager, Secret Scanning) have no user-visible
  "project". Error messages and field descriptions must not say "project" there.

### 3.3 Legacy and shared behavior

- Does the change alter what an existing or deprecated endpoint does? Reviewers want a new service
  method (for example `processNewCommitRawV2`) beside the old one, so the old path keeps its behavior
  and a rollback is a matter of switching callers. Don't edit deprecated routers unless the task is
  about them.
- Does a shared helper gain a parameter (such as `trx`) that silently skips a step for one caller?
  Example: passing `trx` into a builder that only runs a policy scan when no transaction is
  supplied removes that scan from the approval path.

### 3.4 Transactions and the connection pool

Apply CODE_QUALITY.md "Do not create deadlock conditions" line by line: every DAL `await` inside a
`transaction(` callback ends in `tx`, helpers forward `tx`, no nested `transaction()`, no network,
waiting, heavy CPU, or unbounded row counts between `BEGIN` and `COMMIT`. Then also check:

- **Side effects that escape a rollback.** A batch that creates A and then fails on B rolls back A,
  but a sync job or webhook enqueued while creating A still fires. Collect side effects inside the
  transaction and run them after commit.
- **Side effects lost after commit.** After commit, an enqueue that Redis rejects is gone, and the
  route still says success. If the side effect must happen (secret syncs, dispatch to an external
  system), write it to the event outbox in the same transaction. If a best-effort enqueue can throw
  after commit, make sure it cannot skip the audit event or turn a committed write into a 500.
- **Check-then-act races.** "Does the name exist? Then insert" is not safe under concurrency. Rely
  on a unique constraint and map the violation to a `ConflictError` (409). Where a constraint is
  not possible, every writer must take the same lock before it checks: `FOR UPDATE` on an existing
  shared parent row (the project or folder), or a transaction-scoped advisory lock on the name.
  `FOR UPDATE` on the lookup of a name that does not exist yet locks nothing.

### 3.5 Request weight and query shape

- How many queries does one request make, and does that number grow with tenant data
  (environments, folders, secrets, members)? A loop with a DAL call inside is N queries; prefer one
  `whereIn`.
- Does the query fetch more than the check needs? An existence check that calls a list method with
  several joins and decrypts values, when it needs only the key, is the most common finding. Write a
  narrow DAL query (select the column you need, filter by key and folder IDs). For any non-trivial
  new query, run `EXPLAIN ANALYZE` on realistic data before you call it fast.
- Does a small page load a whole tree? A 20-row page that resolves folder paths by loading every
  folder in the environment, refreshed every 30 seconds, is heavy for large projects.
- Independent awaits on a hot path can run concurrently, but check the failure semantics.
  `Promise.all` rejects with whichever call fails first, which can turn an expected 401 into a 500.
  Check the result that decides the status code first, or use `Promise.allSettled`.
- Keep cheap early returns ahead of expensive work. Moving a "this event is disabled" return below
  a plan fetch makes every disabled request pay for a license-server round trip.
- CPU work in the request thread (regex expansion, key generation, bulk crypto, large JSON) blocks
  every other request on the pod. User-controlled patterns need a bound on the work itself, not only
  on the number of attempts.
- Loops over several resources must not let one missing resource discard the results for the
  others (a missing folder in one environment means "no match there", not a thrown error).
- Caches: when two Redis keys must agree (a data payload and a marker), write the data before
  publishing the marker, or both atomically. A stale entry must never keep a revoked permission
  working.
- Long fan-out reads should honor client disconnects (`getClientDisconnectSignal`).

### 3.6 Queues, cron, and external calls

- Recurring work uses the cron manager, never BullMQ repeatable jobs.
- Third-party list calls paginate with a capped loop (CODE_QUALITY.md, external pagination).
- Outbound calls have a timeout, and upstream failures become a named, user-readable error.
- Cron and cross-project queries that cause an external side effect (rotation, sync, reminder)
  filter out soft-deleted projects and environments.

### 3.7 Audit events, errors, and user-facing text

- Every identifier in audit metadata has a human-readable label beside it (project name, request
  slug, email). Field names say what they identify (`approvalRequestId`, not `requestId`). The event
  records the outcome. Renaming or retyping an existing field is breaking.
- Free text that reaches an audit event uses `auditSafeText` on create, and the service check on
  update (`backend/AGENTS.md`, Free Text in Audit Events).
- Errors use product vocabulary, quote the identifier the caller sent, and never leak Knex, SDK, or
  SQL text. No path in the diff should end in an unexplained 500.
- If the change swaps an error class (for example `ForbiddenRequestError` to `ConflictError`), find
  every test that asserts the old one, and have the frontend match on the error type
  (`ApiErrorTypes.ConflictError`) rather than a bare status code.

### 3.8 Migrations and schema

- The migration was created with `npm run migration:new`, and `npm run generate:schema` was run so
  `src/db/schemas/` matches.
- Is it safe on a large table? A new NOT NULL column needs a default; a backfill over tenant data
  runs in chunks; new FK columns get an index; inbound FKs on cascaded tables follow the soft-delete
  rules in `backend/AGENTS.md`.
- Does `down` actually reverse `up`?
- Does every insert built in a `.map()` still match the table? TypeScript does not catch stale fields
  there.

### 3.9 Dependencies and config

- For a dependency bump, read the changelog between the two versions for behavior changes in the
  code paths we use, not only for breaking API changes, and think about self-hosted defaults.
- A deprecated option gets a follow-up, not a new use.
- Native addons and install scripts follow the `allowScripts` rule in the root `AGENTS.md`. Check FIPS
  impact for anything crypto-related.
- New env vars are validated in the config schema and safe for self-hosted defaults.

### 3.10 Tests

Ask whether the change breaks an existing test (error classes, response shapes) and whether the
risky part of the change has any test. Don't ask for tests on low-risk paths. New API end-to-end
tests belong in the Go suite under `tests/`, except tests that need direct Postgres or Redis
access, an internal service handle, or a mocked module, which stay in `backend/e2e-test/`. Read
`tests/AGENTS.md` before asking for a test to move.

## 4. Verify before you report

- Confirm every finding in the code. A finding names the file and line, the input or sequence that
  triggers it, and what the user sees (a 422, a 500, a leaked environment name, a sync that never
  runs). If you cannot name a trigger, it is a question, not a finding.
- Treat bot findings on the PR (Greptile, Codex, Claude) as leads. Confirm each one, and check it
  against the house exceptions in the lessons file before repeating it. Bots repeatedly ask for
  `.uuid()` on `projectId`, which is wrong here.
- When reviewing your own change, run the checks for the server you changed. For `backend/`, run
  `make reviewable-api`, and when a finding depends on behavior, the narrowest suite with
  `make test-api-unit SPEC=<pattern>`. For `backend-go/`, run `make lint` and the relevant
  `make test-unit` or `make test-integration` from `backend-go/`.

## 5. Report

Lead with a one-sentence verdict: ready, ready after the blocking items, or needs rework. Then group
findings by severity, most severe first:

- **Blocking:** permission or data leak, data loss, a broken existing contract, a deadlock or pool
  exhaustion risk, a side effect that fires on rollback or is lost after commit, a 500 on an
  expected input.
- **Should fix:** a missing validation bound, a heavy query on a hot path, unreadable audit or error
  text, a rate limit sized wrong for the client, REST shape problems.
- **Question:** a REST deviation or design choice the author should confirm. CODE_QUALITY.md says to
  point these out with the conforming alternative, not to implement or "fix" them silently.
- **Nit:** naming, wording, small consistency issues. Keep these few.

For each finding write where (`path:line`), what happens (trigger and visible result), and the fix
you suggest. Don't list areas where you found nothing.

When a review turns up a new kind of finding that this skill and the lessons file don't cover, add
it to [references/review-lessons.md](references/review-lessons.md) with a link to the PR.
