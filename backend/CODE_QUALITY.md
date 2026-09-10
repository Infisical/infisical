# Backend Code Quality Guide

Things backend code should **at least** handle. This is a floor, not a standard: it is
deliberately not exhaustive, and clearing everything here does not make a change correct.
Expect it to grow as we find more worth checking.

`backend/CLAUDE.md` still covers where code goes and which pattern to follow.

- [Errors users can understand](#errors-users-can-understand)
- [Validate every API input](#validate-every-api-input)
- [Paginate external API calls](#paginate-external-api-calls)
- [Do not create deadlock conditions](#do-not-create-deadlock-conditions)
- [Intuitive API interfaces](#intuitive-api-interfaces)
- [License checks](#license-checks)

---

## Errors Users Can Understand

The person reading an error is not looking at our code. If the message only makes sense
to someone who is, it is not a usable error.

**Write the message for the user, not for the developer who wrote the throw.** Say what
went wrong in product vocabulary, and where possible what to do about it. Technical
detail belongs in the logs.

```ts
// Bad: internal vocabulary, means nothing to the caller
throw new BadRequestError({ message: "kmsKeyId resolution failed for orgId scope" });

// Good: the caller learns what is wrong and what to do next
throw new BadRequestError({
  message: `Project '${projectName}' has no Gateway assigned. Assign one under Project Settings > Gateways before creating a PAM resource.`
});
```

Include the identifier the caller actually passed, so the failure is reproducible:
`PKI subscriber named '${subscriberName}' not found` is the existing house style. Quote
it so empty strings and stray whitespace are visible.

### No pointless 500s

A 500 with a generic message is the worst outcome for a user. Nothing tells them whether
to fix their request, retry, or open a ticket, so it just blocks them. Most 500s are a
failure we could have anticipated and named.

- If the caller's input caused it, it is a `BadRequestError` naming the field.
- If an upstream dependency failed, catch it and say which one, in terms the user
  recognizes (the provider, not our internal service name).
- Never let a raw Knex or SDK error reach the client. Its message can carry column names,
  constraint names, and SQL fragments, and it tells the user nothing useful.
- A 500 that does survive still needs a log line with full context and identifiers.

Use the classes in `src/lib/errors/index.ts`. One thing to get right: a resource in
another org returns `NotFoundError`, not `ForbiddenRequestError`, so the API cannot be
used to confirm that another tenant's resource IDs exist.

Never interpolate a secret, token, key, connection string, or full outbound URL into a
message. Errors get logged and pasted into tickets. For URLs, use `sanitizeUrlForLog`
from `@app/lib/logger`.

---

## Validate Every API Input

**Every parameter and body property a user can send needs an explicit constraint**: a
length bound, and where it applies, the allowed character set. That is what makes a bad
request fail immediately with a message naming the problem, instead of failing deep in a
service or landing in the database as a row nothing else can handle.

`z.string()` is almost never right. It accepts a 40MB string.

```ts
// Bad: unbounded, untrimmed, accepts "" and "   "
name: z.string(),

// Good: reuse the shared helpers in src/server/lib/schemas.ts
name: GenericResourceNameSchema,
slug: slugSchema({ max: 32, field: "Environment slug" }),
projectId: z.string().uuid(),
description: z.string().trim().max(500).optional(),
port: z.number().int().min(1).max(65535),
```

- **Reuse the shared schemas** (`slugSchema`, `GenericResourceNameSchema`,
  `SecretNameSchema`) instead of re-deriving the rules, so one endpoint does not accept a
  name that another rejects.
- **Bound every string with `.max()`**, matched to the real column width.
- **`.trim()` anything used as an identifier**, so `"prod "` and `"prod"` are not two rows.
- **IDs are `.uuid()`; enums are `z.nativeEnum(...)` or `z.enum([...])`**, so the accepted
  values appear in the generated docs.
- **`z.coerce.number().int()`** for querystring numbers, since everything arrives as a string.
- **Never `.default(x).optional()`.** The `.optional()` wraps the default, so `undefined`
  stays `undefined` and the default never applies.

Zod only validates shape and bounds. Rules that need to read other rows (does this `caId`
exist, is it in this project, is this state transition legal) belong in the service, and
every ID the caller supplies must be checked against the org or project the request is
authorized for, not just checked for existence.

---

## Paginate External API Calls

When we list resources from a third-party API (Cloudflare zones, GCP projects, CircleCI
env vars, and every other app connection or secret sync), **the first response is usually
one page, not the whole set.** Most providers default to 20 to 50 items and say nothing
about the rest. If we read `data.result` and return it, the list is silently truncated
and the user gets a resource picker missing the zone they need.

This is a live bug source, not a hypothetical. Treat any request that returns a list as
paginated until you have checked the provider's docs and confirmed it is not.

```ts
// Cursor / page-token style (GCP, CircleCI): loop until the token is gone
let pageToken: string | undefined;
do {
  const { data } = await request.get(url, { params: { pageSize: 100, pageToken } });
  items.push(...data.projects);
  pageToken = data.nextPageToken;
} while (pageToken);

// Page-number style (Cloudflare): ask for the max page size, follow total_pages
while (page <= totalPages && page <= MAX_PAGES) {
  const { data } = await request.get(url, { params: { page, per_page: PER_PAGE } });
  items.push(...data.result);
  totalPages = data.result_info?.total_pages ?? 1;
  page += 1;
}
```

- **Request the provider's maximum page size**, so the common case stays one round trip.
- **Follow the provider's own signal** (`nextPageToken`, `has_more`, `total_pages`, a
  `Link` header), never an assumption about how many pages exist.
- **Cap the loop.** An unbounded `while` over a third-party API hangs if the provider's
  cursor never clears. See `CLOUDFLARE_MAX_PAGES` in
  `src/services/app-connection/cloudflare/cloudflare-connection-fns.ts`.
- **Do not truncate silently.** If you hit the cap, log it.

In that same Cloudflare file, `listCloudflareZones` paginates correctly while
`listCloudflarePagesProjects` and `listCloudflareWorkersScripts` return only the first
page. That is exactly the bug, and it is easy to write by accident.

---

## Do Not Create Deadlock Conditions

**Each instance gets about 10 database connections** (`DB_POOL_MAX`, default 10). That is
the entire budget, and it fills up far more easily than it looks. The deadlocks we hit
are not exotic lock-ordering problems, they are ordinary code exhausting that pool.

They are also very hard to catch while developing, because everything passes when you are
the only request. **This is the check we most need help with: spot the trigger in review,
because we will not see it until production.** The two triggers to look for are a query
inside a transaction that does not use the transaction, and a transaction held open
longer than it needs to be.

### A missed `tx` costs a second connection

Every DAL method takes an optional trailing `tx`. `ormify` resolves the connection as
`(tx || db)` for writes and `(tx || db.replicaNode())` for reads, so a call that omits
`tx` does not join your transaction: it checks out **a second connection** and runs
outside it. (`db.replicaNode()` falls back to the primary pool when no read replica is
configured, the normal self-hosted case, so a stray read does not escape to another pool
either.)

One request now holds two connections at once. Once concurrent requests on that path
reach the pool size, every request is holding its transaction connection and waiting for
a second one that nothing can free. That is a deadlock rather than slowness: it does not
clear when load drops. With a pool of 10, the threshold is ordinary traffic.

```ts
// WRONG: these two run on separate connections, outside the transaction
await projectDAL.transaction(async (tx) => {
  const project = await projectDAL.findById(projectId);       // <- missing tx
  const env = await projectEnvDAL.findOne({ projectId });     // <- missing tx
  await projectDAL.updateById(projectId, { name }, tx);
});
```

**Inside a `transaction()` callback, every DB call passes `tx`**, with no exception for
reads or for "just a quick lookup". The same applies through helpers: a function that
touches the database and can be called from inside a transaction must accept `tx?: Knex`
and forward it, or everything it does happens outside the transaction. Do not open a
nested `transaction()` (pass the existing `tx` down), and do not use `requestMemoize`
inside one, since it can hand transactional code a value read outside it.

Reviewing for this means reading the callback and checking that **every `await` on a DAL
method ends in `tx`**. A trailing `)` where you expected `, tx)` is the whole bug.

### A slow transaction holds its connection the whole time

A transaction pins one connection from `BEGIN` to `COMMIT` and holds its locks for that
entire window. A transaction that takes 4 seconds against a pool of 10 caps that path at
roughly 2.5 requests per second and starves everything else sharing the pool. Long
transactions also block vacuum across the whole database, so one slow writer degrades
tables it never touched.

**Nothing slow or unpredictable goes between `BEGIN` and `COMMIT`:**

- **No network calls.** No HTTP, no AWS/GCP/Azure SDK calls, no email, no Slack or
  webhook delivery, no gateway round-trips, no external KMS or HSM. An upstream that
  takes 30 seconds to time out holds your connection and your locks for 30 seconds.
- **No waiting.** No sleeps, no polling, no retry loops.
- **No expensive CPU work.** Key generation, certificate signing, password hashing, bulk
  encrypt/decrypt. Node is single-threaded, so this blocks every other request as well.
- **No unbounded row counts.** A transaction whose size is set by tenant data will
  eventually exceed any timeout. Chunk it, each chunk in its own transaction with a
  per-batch `SET LOCAL statement_timeout`.

The shape that works: read and validate, do the expensive and external work, then open a
short transaction for only the writes that must be atomic together, then fire side
effects after commit. **Enqueue queue jobs after commit**, never inside, or a worker can
pick up a job for a row that has not committed yet.

---

## Intuitive API Interfaces

**We align to REST.** Resources are nouns, the verb lives in the HTTP method, status
codes mean what they mean, and `GET` never mutates. An API is also a contract we cannot
take back, so before writing the handler, check that a competent engineer could call the
endpoint correctly from the OpenAPI docs alone.

- **Resource-shaped URLs, plural nouns, the verb in the method.** Genuinely non-CRUD
  actions get a sub-path (`POST /pki/subscribers/:id/issue-certificate`). What they do
  not get is an `action: "grant" | "revoke"` field in the body that switches behavior.
  That is two endpoints.
- **`GET` is safe, `PUT`/`DELETE` are idempotent.** A `GET` that writes breaks caches,
  retries, and prefetching. Repeating a `PUT` or `DELETE` must not change the outcome.
- **Status codes carry meaning.** 201 with the created resource, 204 for a delete with no
  body, 404 for a missing or out-of-scope resource, 409 for a genuine conflict. Never
  return 200 with an error inside the body.
- **Match names that already exist.** Use `projectId`, not `workspaceId` (which now
  survives only in `deprecated-*` routers). Timestamps are `createdAt` / `updatedAt` in
  UTC ISO 8601. Durations carry their unit (`ttlSeconds`), never a bare `ttl`.
- **Return the resource, not a receipt.** `POST` and `PATCH` return the full object so
  the client does not need a follow-up `GET`. `{ "success": true }` is not a response.
- **Wrap it in a named key** (`{ subscriber: {...} }`) so the shape can be extended later.
- **Select response fields deliberately.** Never return a DB row wholesale: rows carry
  `encrypted*` / `hashed*` columns and internal FKs, and every accidental field becomes a
  contract we owe.
- **The schema is the docs.** Routes use the Zod type provider, so `operationId` and a
  `.describe()` on every field are part of the deliverable (put the strings in
  `src/lib/api-docs/`). Every route also needs `config.rateLimit` and an
  `onRequest: verifyAuth([...])` listing only the auth modes that genuinely need access.
- **Adding an optional field is safe; everything else is not.** Renaming a field,
  tightening validation, changing a default, or changing a status code breaks callers.
  Add a new route version and deprecate the old one.

### When a design has to break REST

Sometimes it genuinely does: a bulk operation that cannot be expressed per-resource, a
batch endpoint, an RPC-shaped action, matching a protocol we do not control (ACME, SCIM,
SCEP), or staying consistent with a neighbouring endpoint that already deviates.

**Do not just implement it, and do not silently "fix" it either. Point it out.** Say
which REST expectation the design breaks and what it costs, propose the conforming
alternative, and let the author confirm the deviation is intentional. An intentional
deviation is fine and should be noted in a comment on the route so the next person does
not read it as an accident. An unintentional one is much cheaper to catch now than after
customers are calling it.

---

## License Checks

A license check answers exactly one question: **is this org entitled to use this feature
right now?** It must never be allowed to answer a second one, which is whether the data the
org already has still means what it meant yesterday.

Plans move. A customer gets a feature, builds on it, and later downgrades. So:

**Check the license when someone creates, enables, or edits something that uses the feature.
Do not check it when reading, resolving, evaluating, listing, or deleting.** Losing an
entitlement makes a feature read-only. It does not delete, hide, or reinterpret what the
customer built while they had it.

### The failure this prevents

#### Example 1

An org had cross-project secret sharing and used it to structure real projects, with folders
pulling secrets in from another project. Then they downgraded. `expandSecretReferences` was
consulting `plan.crossProjectSecretSharing` on the read path
(`checkCrossProjectAllowed` in `src/services/secret-v2-bridge/secret-reference-fns.ts`), so
every cross-project reference stopped resolving and their applications started reading empty
values from a `GET` they had not changed. Nobody wrote anything. Nothing was deleted. Their
secrets simply stopped being their secrets.

That shape is not specific to secrets management. Any license check on a read path gives a
customer a different answer to the same request depending on their billing state, and the
customer finds out at runtime, in production, on a request they did not make.

#### Example 2

Custom project roles are a paid feature, and they show what the correct outcome looks like.
An org on a paid plan creates custom roles and assigns them to users. Later they downgrade to
a free plan. Those roles keep working: the rows stay, the assignments stay, and every user
holding one keeps exactly the access that role grants. `permission-service` never reads the
plan while it builds a CASL ability, so a downgrade cannot quietly narrow someone's access or
hand them a different set of permissions than they had the day before.

What the downgrade takes away is the ability to change the set. Creating a new custom role
and editing an existing one both fail with a message naming the plan, and the UI opens the
upgrade modal on those same two actions. `role-service.ts` is the model to copy: `createRole`
and `updateRole` check `plan.rbac`, while `listRoles`, `getRoleBySlug`, and `deleteRole`
check nothing.

One rule produces both outcomes. Entitlement decides what a customer can build. It never
decides what an already-built thing does.

### What that means in practice

- **The plan must never change a response.** Not its shape, not its contents, not whether a
  reference resolves. Same request and same data means the same answer, whatever the license
  says.
- **Gate the write that introduces the dependency**, at the moment the customer asks for the
  feature: creating a cross-project grant, creating a secret import from another project,
  creating or updating a custom role, turning a configuration on.
- **Never gate a delete or a revoke.** A downgraded customer has to be able to remove the
  thing they can no longer create. `deleteGrant` in
  `src/services/project-folder-grant/project-folder-grant-service.ts` refuses without the
  entitlement, so the grant stays in place with no way to take it back.
- **Never gate a list, a read, or a usage lookup of the feature's own records.**
  `listGrantsByProject` in that same file returns `[]` once the entitlement is gone, so an
  admin cannot see, audit, or clean up grants that are still live and still resolving.
  Hiding a record does not disable it, it only removes the operator's way to deal with it.
- **Existing objects keep working, and keep being enforced.** Whatever a customer built while
  entitled stays in effect after the downgrade, exactly as it was. Only creating and editing
  it is blocked (Example 2).
- **Quantitative limits are write-path checks too.** Enforce a seat, project, or retention
  cap where the count grows. Never enforce one by hiding or dropping rows that already exist.
- **Audit every call site of an entitlement helper, not just the helper.** A predicate such
  as `isCrossProjectEnabled` is fine to share; one caller of it on a read path is the bug.
- **Do not hide the feature in the UI either.** Leave the entry point where it is, and when
  an unentitled user tries to use it, open `UpgradePlanModal`
  (`frontend/src/components/license/UpgradePlanModal`) so they learn what the feature is and
  how to get it. A hidden feature teaches a customer nothing and looks like it does not
  exist. The modal is the frontend half of the same rule the backend follows: the block
  lands on the attempt to create or edit, never on viewing what is already there.
