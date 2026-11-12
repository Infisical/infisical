# License domain

Two services, one module. Take only the one you use:

- `licenseService: TLicenseService` (`LicenseModule.service`): entitlements. `getPlan` then `plan.has` /
  `plan.assert`, the instance's own license (`getInstanceEntitlements()`, a model: `.plan()` for plan features,
  `.has(InstanceFeature.Fips)` for the instance-only flags), seat usage.
- `usageMeteringService: TUsageMeteringService` (`LicenseModule.usageMeteringService`): reports usage to the
  License Server via `emit`, `recordMeteringEvents`, `countUsage`, `syncSeats`.

Owns no tables. Its state is the plan cache in the key store and the usage queues.

**CE is the mechanism, EE is the policy.** CE caches plans, queues and sends usage, counts usage and checks
features. EE decides the free tier (`getDefaultOnPremFeatures` in `ee/services/license-policy/default-features.ts`), parses and
verifies license keys, maps License Server entitlements to a plan, and talks to the License Server. EE plugs in
through `ce/services/dependencies.ts`: `TLicensePolicyService` = `LicensePolicyService` (what the instance and each cloud org get),
`TLicenseServer` = `LicenseServerClient`. Never add defaults or fallbacks for them in `ce/`: a free tier copy in MIT code is one
anyone can edit into a paid one.

| Layer | Holds |
| --- | --- |
| `ce/models/` | `Plan`, `InstanceEntitlements`, `SeatUsage`, `Meter`. No feature data |
| `ce/data-access/` | `PlanCache`, `UsageReportCache` (key store) and their key names |
| `ce/services/` | `license/`, `usage-metering/`, `usage-report/`, `dependencies.ts` |
| `ce/services/helpers/` | `UsageQueue`, `usage-counters.ts` (`CounterRegistry` and the seat counters), and the License Server billing and entitlement shapes (`license-server-types.ts`, with `TLicenseServerBilling`) |
| `ee/services/license-policy/` | `LicensePolicyService` (the instance's license: cloud, online or offline key, or community; and cloud org plans), with `default-features.ts` (the free tier only), `license-key.ts` (key parsing, offline key shape), entitlement projection (the only place the free tier is applied), feature mapping |
| `ee/clients/license-server/` | `LicenseServerClient` (entitlements, billing, usage) for both cloud and self-hosted, the self-hosted token provider, error mapping |

Rules:

- **Cloud plans are cached under the root org.** A sub-org's plan is its root's. Last-known plan, fallback and
  pass-through markers are keyed by root too; the usage reconcile marker stays per org.
- **A plan fetch sends the root org's name and slug.** That's mostly how the License Server learns them, so read
  them fresh each fetch (`findOrganization`), since orgs get renamed.
- **Key names, TTLs and queue names are frozen** (`plan-cache.ts`, `usage-report-cache.ts`, `UsageQueues`): old
  pods share them during a rolling deploy.
- **Only a License Server failure writes the fallback plan** (`fetchPlanOrFallback`). DB or key store errors
  throw, so they never clobber a cached paid plan.
- **`getPlan` returns a `Plan`, which keeps its props private and frozen.** Check a feature with
  `plan.has(PlanFeature.X)` / `plan.assert(PlanFeature.X)`, a product a plan can switch off (null means available)
  with `plan.allows(PlanProduct.X)`, and read data through its getters (`slug`, `rateLimits`, ...). Add a getter only
  for data with no rule attached. `toJSON()` returns a mutable copy for the cache and API responses. Code holding only
  the instance's feature props wraps them in `Plan.restore(...)` first. A new feature gets a `PlanFeature` member and a `featureNames` entry
  (the compiler requires both).
- **Check a numeric limit through the plan, never by reading the field.** Name it with the `PlanLimit` enum (add a
  member for a new limit). `plan.limit(PlanLimit.X)` is the cap the plan enforces (null when uncapped),
  `isLimited` says whether to count at all, and `exceeds(PlanLimit.X, used, adding)` answers the check. They hold the rules a raw field read gets wrong: an enterprise identity limit only counts with
  `enforceIdentityLimit` and 0 means uncapped, `maxCas` takes the larger of it and `maxInternalCas`, and an offline
  v1 license may lack the field. The caller keeps its own error and message.
- **Keep `ce/module.ts` cheap to import.** See the `import type` rule in `src/domains/AGENTS.md`.
- **License never joins a caller's transaction.** It owns no rows, so it hands out values before the
  transaction and the domain owning the rows does the locked count. For a seat limit that must hold under
  concurrency (identity create), read the plan and `getSeatCountScope(orgId)` before your transaction, then
  call `organizationsProjectsService.within(sealKnexTransaction(trx)).lockAndCountBillableOrgActors(scope)`
  inside it, before the insert, and check
  `plan.exceeds(PlanLimit.Identities, SeatUsage.fromBillableActors(counts).identitiesUsed)`. Paths that never locked
  (SSO, SCIM, invites) read `getSeatUsage` before the transaction and call `seatUsage.assertAvailable(plan, via)`
  inside it. `syncSeats` runs after the commit and never throws; code already
  inside a caller's transaction (org/project create) leaves it to the caller.
- **Name a meter with `Meter`, never its key.** `emit`, `countUsage`, `recordMeteringEvents` and `usageCounter` take a
  `Meter` (`Meter.SecretIdentities`). A key arrives as a string only from a queued job or a License Server catalog
  dimension; turn it into a meter once with `Meter.fromKey`, which returns null for a key no meter defines.
- **The two services share the queue, not internals.** `getPlan` asks `UsageQueue.reconcile` to resend an active
  paid org's meters; `UsageReportService` and `syncSeats` call `getPlan`/`refreshPlan`.
- **Deleted orgs close from the outbox.** Only the `license-org-deleted` consumer
  (`services/org/license-org-deleted-consumer.ts`) calls `closeDeletedOrg`, for root orgs on cloud. It throws so
  the outbox retries; the License Server delete is idempotent.
- **License knows no product.** It sits on `organizationsProjectsService` and builds the two seat meters
  (`identities`, `user_identities`) itself (`seatUsageCounters` in `services/helpers/usage-counters.ts`). Every other meter comes in as a
  `TUsageCounter` from the owning product domain. organizations-projects never imports License. A meter's
  `scope` picks the reporter: `org-tree` reports at the root, `org` at the org that changed. Self-hosted reports
  everything once as `self-hosted`, counting the whole instance (`count(null)`).
- **Build it with `LicenseModule.create(deps)`**, which reads the instance license first so nothing runs without
  one. `start()` only registers the usage workers and daily flush. `UsageReportService` stays inside the module: only its queues and cron call it.
- **CE never sees the usage wire format.** The EE client builds the body and idempotency key and maps responses
  to outcomes: `no-license`, `not-priced`, `rejected` are final, anything else throws so the queue retries. A new
  final answer goes in the client, not as a status check in `UsageReportService`.
- **Billing isn't on `TLicenseService`.** It's the EE `LicenseServerClient`, returned by `createDomains` as
  `licenseBilling` and passed only to subscription code.
- **Offline licenses never hit the License Server** (`LicenseServerClient.fromConfig` stays dormant).
- **Only `license-policy/entitlement-projection.ts` imports `./default-features`, by that exact specifier.** The e2e
  suite aliases it to `e2e-test/fakes/default-features.ts`, so a free tier read anywhere else escapes the
  mock; go through the projection's builders (`communityFeatures`, `cloudPlanFeatures`, ...).
  `.github/workflows/run-backend-bdd-tests.yml` `sed`s feature lines in it by path, so update that workflow if the
  file moves.
- **Tests:** `ce/testing/build-license.ts` builds the module on an in-memory key store and queue, with
  `FakeLicenseServer` (policy and License Server) and `FakeOrganizationsProjectsService`. `testFeatures()` is
  test data, not product defaults. Consumers use `FakeLicenseService` / `FakeUsageMeteringService`; product
  domains read their counters with `usageCounter(module.usageCounters, Meter.X)`.
