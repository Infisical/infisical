# Backend review lessons

What reviewers flagged on recent backend PRs, grouped by theme. Each entry says what was flagged,
why it mattered, and what the fix looked like. "Human" entries came from an Infisical engineer;
"bot" entries came from Greptile, Codex, or Claude and were confirmed against the code.

Add new entries at the end of the matching section, with a PR link.

## House exceptions (where a general rule does not apply)

- **`projectId` is not validated with `.uuid()`.** Human, twice:
  [#8689](https://github.com/Infisical/infisical/pull/8689),
  [#9001](https://github.com/Infisical/infisical/pull/9001). `projects.id` is `varchar(36)` and
  projects migrated from MongoDB do not have UUID IDs, so `.uuid()` rejects real customers. In the
  same PRs, Greptile and Codex asked for `.uuid()` citing CODE_QUALITY.md; that finding is wrong for
  `projectId`. Use `z.string().trim()` with a bound.
- **Private routes don't get public API docs.** Human, [#8689](https://github.com/Infisical/infisical/pull/8689):
  for a route marked `hide: true` that only our frontend calls, remove the entries added to
  `src/lib/api-docs/constants.ts` and the docs page. Bots still ask for `.describe()` on hidden
  routes; a short inline description is enough there.
- **Deprecated endpoints are left alone.** Human, [#8689](https://github.com/Infisical/infisical/pull/8689):
  "if it is deprecated we don't need to change this."

## Legacy behavior and rollback

- **New behavior goes in a new method, not into the legacy one.** Human,
  [#8689](https://github.com/Infisical/infisical/pull/8689): a new batch route reused
  `processNewCommitRaw` and changed what the legacy endpoint did. The reviewer asked for a new
  `processNewCommitRawV2` so the old route keeps working and the change can be rolled back.
- **Name the route after the resource and the right version.** Human,
  [#8689](https://github.com/Infisical/infisical/pull/8689): a `v4/commit` route became
  `/api/v2/pit/batch/commit`, because it belongs to the point-in-time (PIT) resource.
- **Tightening validation on a v1 endpoint breaks callers.** Bot (Codex),
  [#8664](https://github.com/Infisical/infisical/pull/8664): replacing a `[a-z0-9-]+` slug check with
  the shared slug schema made existing slugs such as `foo--bar` fail with 422, including on edits
  that did not touch the slug, because the client resends the whole body.
- **Swapping an error class breaks tests and clients.** Bot (Greptile) and human,
  [#8664](https://github.com/Infisical/infisical/pull/8664): a duplicate name changed from
  `ForbiddenRequestError` to `ConflictError`; two service tests still expected the old class, and
  the reviewer asked the frontend to match `ApiErrorTypes.ConflictError` instead of a bare 409.

## Permissions and data exposure

- **Existence checks must not reveal what the caller cannot read, and must not block the caller
  on paths they can use.** Human, [#9001](https://github.com/Infisical/infisical/pull/9001): a
  server-side duplicate-key check across environments required access to every path, so a user
  missing access to one environment could not use quick add at all ("something that can appear on
  support and bite us back"). The suggested fix: run the check, and leave out environments the
  caller has no permission to see.
- **Auth modes are the ones the route needs.** Human,
  [#8689](https://github.com/Infisical/infisical/pull/8689): a frontend batch route should accept JWT
  (and OAuth) only, not identity access tokens.
- **Org-scoped products don't say "project".** Human,
  [#8664](https://github.com/Infisical/infisical/pull/8664): Cert Manager error messages must not mention
  projects.

## Request weight and query shape

- **Existence checks use a narrow query.** Human, [#9001](https://github.com/Infisical/infisical/pull/9001):
  the check used `findByFolderIds`, which does several joins. The reviewer asked for a query that
  returns only the key, filtered by key and folder IDs, and for `EXPLAIN ANALYZE` on a realistic
  dataset to confirm it is faster.
- **Rate limits must fit how the client calls the route.** Bot (Claude),
  [#9001](https://github.com/Infisical/infisical/pull/9001): the UI sent one request per environment on
  every typing pause, which can exhaust `readLimit` in about a minute; each 429 was caught as "no
  conflict". Fix: one request for all environments, cache answers, or size the bucket for the use.
- **One missing resource must not drop the others.** Bot (Greptile),
  [#9001](https://github.com/Infisical/infisical/pull/9001): a folder missing in one environment threw and
  lost the conflicts already found in other environments, so quick add went on to create duplicates.
- **A small page should not load a whole tree.** Bot (Greptile),
  [#8678](https://github.com/Infisical/infisical/pull/8678): resolving folder paths for a 20-row approvals
  page loaded every folder in each environment, refreshed every 30 seconds.
- **Concurrency changes error precedence.** Bot (Greptile),
  [#9087](https://github.com/Infisical/infisical/pull/9087): running the session and user lookups in one
  `Promise.all` meant a failed user lookup returned a 500 before the session check could return 401.
- **Keep cheap early returns first.** Bot (Greptile), [#9087](https://github.com/Infisical/infisical/pull/9087):
  moving the "event disabled" return below the plan fetch made disabled login events wait for the
  license server.
- **CPU work moved onto the server needs a bound.** Bot (Greptile),
  [#9045](https://github.com/Infisical/infisical/pull/9045): generating values from user-supplied regexes
  in the request handler let nested repeats expand without limit and block the pod. An attempt cap
  does not bound one attempt.
- **Generation defaults are not rule requirements.** Bot (Greptile),
  [#9045](https://github.com/Infisical/infisical/pull/9045): a default minimum length of 16 made valid
  rules with `maxLength: 8` fail.

## Transactions, side effects, and caches

- **Side effects run after commit.** Bot (Codex), [#8689](https://github.com/Infisical/infisical/pull/8689):
  in a batch, `createManySecret` enqueued a sync before a later operation failed and rolled back,
  so the worker processed secrets that never existed, and queue I/O ran while holding the connection.
- **After commit, a failed enqueue is lost.** Bot (Greptile),
  [#8689](https://github.com/Infisical/infisical/pull/8689): the sync enqueue after commit only logged a
  Redis failure, so connected services could keep stale values; a later revision let it throw, which
  skipped the audit event for a committed write. Durable work belongs in the event outbox.
- **Passing `trx` skipped a policy check.** Bot (Greptile),
  [#8689](https://github.com/Infisical/infisical/pull/8689): `buildSecretApprovalCommits` only runs
  `scanSecretPolicyViolations` when no transaction is provided, so the new call skipped it. Run the
  check before opening the transaction.
- **Omitted is not empty.** Bot (Greptile), [#8689](https://github.com/Infisical/infisical/pull/8689): an
  omitted `secretMetadata` became `[]` in the approval builder, which deleted existing metadata when
  the request merged.
- **Two cache keys need a write order.** Bot (Greptile), [#9087](https://github.com/Infisical/infisical/pull/9087):
  writing the permission data and its marker concurrently could publish the marker first on Redis
  Cluster, letting a removed permission keep working.

## API contract details

- **Bound inputs to the column width.** Bot (Codex), [#8689](https://github.com/Infisical/infisical/pull/8689):
  folder names had no maximum while the column is `varchar(255)`, so a 256-character name became a
  500 that rolled back the whole batch. `secretComment` was unbounded too.
- **Don't return DB rows wholesale.** Bot (Greptile), [#8689](https://github.com/Infisical/infisical/pull/8689):
  the response used the whole `SecretApprovalRequestsSchema`, exposing internal fields.
- **Resource-shaped URLs.** Human, [#9001](https://github.com/Infisical/infisical/pull/9001): the duplicate
  check route became `/secret/key-exists`.
- **201 on create.** Bot (Greptile), [#9045](https://github.com/Infisical/infisical/pull/9045).
- **Audit IDs need labels.** Bot (Greptile), [#8689](https://github.com/Infisical/infisical/pull/8689): a new
  audit event carried `projectId` and `approvalId` without the project name or request slug. The
  follow-up [#8874](https://github.com/Infisical/infisical/pull/8874) added the change request slug.

## Dependencies

- **Read changelogs for behavior changes.** Human, [#8679](https://github.com/Infisical/infisical/pull/8679):
  from nodemailer 10.0.12, `requireTLS` overrides `ignoreTLS`, and `SMTP_REQUIRE_TLS` defaults to
  true, so `SMTP_IGNORE_TLS=true` alone stopped turning off STARTTLS for self-hosted email.
- **Track deprecated options.** Human, [#8679](https://github.com/Infisical/infisical/pull/8679): Snowflake's
  `disableOCSPChecks` is deprecated in favor of `certRevocationCheckMode`; worth a follow-up.

## Client-side companions to backend checks

Reviewers also flag the frontend half of a backend check. These are out of scope for a pure backend
review, but mention them when the backend design causes them.

- Disable the save action while a server check reports a conflict, and set the "saving" flag before
  the first `await` so a double press cannot save twice. Human,
  [#9001](https://github.com/Infisical/infisical/pull/9001).
- Put the check in one React Query hook so it is cached and deduplicated, instead of two hand-written
  copies with their own timers. Human, [#9001](https://github.com/Infisical/infisical/pull/9001).
