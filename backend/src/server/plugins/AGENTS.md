# Secret read limit plugins

Two plugins limit how many secrets list requests read: a per-root-organization budget per minute
(`secrets-org-budget.ts`) and a per-instance limit on the secrets that requests hold in memory at once
(`secret-read-concurrency-limit.ts`). The rules every secret read route and service must follow are in the
"Secret Read Limits" section of `backend/AGENTS.md`; this file is the detail for changing either plugin.

## Secrets Org Budget (`secrets-org-budget.ts`)

A route that returns a list of secret values to API callers must charge the organization's read budget: take
`const orgBudget = server.secretsOrgBudget(req, reply)`, call `await orgBudget.check()` inside the `secretReadSlot` it
passes to the service (before `readSlot(work, opts)`), and call `orgBudget.charge(countReturnedSecrets({ secrets, imports }))`
after the service returns. The service takes the slot only after its ETag check, so a 304 is never refused for a spent
budget; a route whose service takes no slot calls `check()` before the read. A read costs one credit per
`SECRETS_PER_BUDGET_CREDIT` secrets, rounded up, against `SECRET_READ_ORG_BUDGET` credits per root organization per minute, so
the limit follows how much an organization reads rather than how often it asks. The check runs before the read and the
charge after it, because the cost is unknown until the secrets are loaded: one read may overshoot the budget and it is the
next one that is refused. Do not move the charge ahead of the read or skip it for a 304, which already costs nothing.
`SECRET_READ_ORG_BUDGET_MODE` is `off` by default; set `observe` to count and record `would_refuse` while refusing nothing,
or `enforce` to refuse with a 429 and `Retry-After`. It runs only where the rate limiter is registered (cloud production). A key store
failure allows the read. The v3 and v4 routes that list secrets are charged, and so are the secret import routes that
list imported secrets (`/secret-imports/secrets` and the dashboard's `/secret-imports`), which pass their result as
`countReturnedSecrets({ secrets: [], imports })`.

A route that returns a single secret by name passes `secretImportSearchSlot(orgBudget, readSlot)` as `secretReadSlot`.
`getSecretByName` takes it only when the secret is not in the folder and it has to load every imported secret to look
for it, so a secret found in its own folder is never checked or charged. The helper charges the imported secrets the
search loaded, not the one secret returned, and charges inside the slot whatever the outcome, because the search that
loads the most is the one for a name that does not exist, which ends in a 404. The paginated dashboard routes
(`secrets-details`, `secrets-overview`, `secrets-deep-search`) and `GET /secrets/id/:secretId` are left out, since none
of them can load a large number of secrets.

A read at or over budget records `infisical.secret.rate_limit.exceeded.count` (`recordSecretRateLimitExceededMetric`,
bucket `org_budget`, outcome `refused` or `would_refuse`), and every charge records the window's running total in
`infisical.secret.org_budget.usage`. The charge that spends the last of the budget also records how many credits it
went past it in `infisical.secret.org_budget.exceeded` (0 when it lands exactly on the budget) and logs the organization,
once per organization per window; the organization id stays out of the metric attributes because it is unbounded. The
per-IP limit records none of these; the per-instance read budget records the first under its own bucket (see Secret Read
Concurrency Limit).

## Secret Read Concurrency Limit (`secret-read-concurrency-limit.ts`)

A route that lists secrets must run its secret load inside `server.secretReadSlot(req, reply)`, which
`server/plugins/secret-read-concurrency-limit.ts` decorates. It keeps one number per instance: the secrets that list
requests hold in memory right now, checked against a budget so a few very large lists cannot exhaust the memory for every
organization. The budget is computed once at boot as `(memory limit - SECRET_READ_HEAP_BASELINE_BYTES -
SECRET_READ_HEAP_RESERVE_BYTES) / SECRET_READ_PEAK_BYTES_PER_SECRET`, where the memory limit is the container's
(`process.constrainedMemory()`), or `os.totalmem()` when the container has none. V8's `heap_size_limit` is left out on
purpose: the image sets the heap flag, so it says nothing about the memory the instance really has, and
`--max-old-space-size` has to be sized to the container for the budget to hold. A per-minute rate limit cannot do this
job, because it lets a burst through in its first second.

`SECRET_READ_CONCURRENCY_LIMIT_MODE` picks the behaviour:

- `off` (default): the slot runs the work and counts nothing.
- `observe`: counts, never refuses, and records `outcome=would_refuse` for each request that arrives with no room.
  Boot never fails; with no room for a budget it warns and reports every request.
- `enforce`: a request that arrives with no room gets a 503 (`ServerBusyError`) with `Retry-After: 1` at once. Nothing
  waits in a queue. Boot fails if the budget is less than one secret.

Observe and enforce share one code path that differs only in the throw, so the observe counter is exactly what enforce
would refuse. Keep it that way.

Where the rate limiter is registered (cloud production, the same `createRateLimit` check the org budget uses), a root
organization may hold at most `ORG_SHARE_OF_BUDGET` of the instance's budget, so one organization's concurrent reads
cannot fill the instance and get every other organization refused. The share is checked wherever the budget is, at
admission and on `reportSize`, and is refused the same way. A read larger than the share runs when its organization
holds nothing else on the instance; without that it could never run. Self-hosted instances have no share, since one
with a single organization would only lose capacity.

Prefer passing the slot to the service as `secretReadSlot` (`TConcurrencySlot`), which wraps only the secret load, so
permission checks and 304s are never counted; wrap the whole service call in it (`readSlot(() => ...)`) only when the
service takes no slot. A route that does neither is outside the budget. The slot hands the work a
`reportSize(secretCount)` callback and takes an optional `sizeKey`:

- A read is admitted on an estimate, because its size is unknown until it runs: the size the same `sizeKey` had last
  time on this instance, else `SECRET_READ_DEFAULT_SECRET_WEIGHT`. Build the `sizeKey` from what decides the result's
  size (project and request parameters) and leave out the actor and the cache version, or the estimate is lost on every
  secret change. `getSecrets` in `secret-v2-bridge-service.ts` is the reference.
- Call `reportSize` as soon as the count is known (after a cache hit is parsed, after the rows are fetched, after imports
  are expanded) and again whenever it changes, before the expensive work that follows (decryption, reference expansion).
  `fnSecretsV2FromImports` and the legacy `fnSecretsFromImports` take an `onSecretsLoaded` callback that runs after
  each import level's rows load and before they are decrypted; pass `reportSize` through it, as
  `getRawSecretsFromImports` in `secret-import-service.ts` does. The import search of `getSecretByName` runs in the
  slot the same way, with a `sizeKey` from `getImportedSecretsSizeKey` that leaves out the secret name: every name
  searches the same imports, and a key per name would give a caller the default estimate again for each new name.
  A report that grows the read past the room other reads leave refuses it there, a 503 in enforce mode and
  `would_refuse` in observe mode, and the size is remembered so the next attempt is refused at admission. Admission
  runs on an estimate, so without this check a cold burst is admitted at the default weight and lands far past the
  budget. A `catch` around `reportSize` must rethrow `ServerBusyError`, as the cache hit path of `getSecrets` does,
  or a refusal turns into a cache miss and a full reload.
- Work that never calls `reportSize` holds its estimate until it finishes, so a large read is admitted at the default
  weight. The legacy V1 project path reports from `loadLegacySecrets` in `secret-service.ts`, which both `getSecrets`
  and the legacy branch of `getSecretsRaw` run.
- A read larger than the whole budget is admitted only when the instance holds nothing, so it runs alone.

A refusal records `infisical.secret.rate_limit.exceeded.count` with bucket `read_budget`, or `read_budget_org_share`
when the organization's share is what had no room. The instance also reports
`infisical.secret.read_budget.capacity`, `.used` and `.peak_used` (gauges; `.peak_used` is the highest `used` since the last export and resets on each read, so never read it from anywhere but the exporter), and once per read `infisical.secret.read.size` (by
`estimate.source`) and `infisical.secret.read.estimate.error`. Do not label any of them with the organization: a histogram per
organization is one set of bucket series per customer per instance, which the `InfisicalCore` rules in `backend/AGENTS.md` forbid. The
throttled warning the plugin logs carries the `orgId` instead.
