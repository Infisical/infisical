# License domain

Two services, one module. Take only the one you use:

- `licenseService: TLicenseService` (`LicenseModule.licenseService`): entitlements. `getPlan` then `plan.has` /
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

| Layer                         | Holds                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ce/models/`                  | `Plan`, `InstanceEntitlements`, `SeatUsage`, `Meter`. No feature data                                                                                                                                                                                                                                   |
| `ce/data-access/`             | `PlanCache`, `UsageReportCache` (key store) and their key names; `InstanceEntitlementsCache` (in memory)                                                                                                                                                                                                |
| `ce/services/`                | `license/`, `usage-metering/`, `usage-report/`, `dependencies.ts`                                                                                                                                                                                                                                       |
| `ce/services/helpers/`        | `UsageQueue`, `usage-counters.ts` (`CounterRegistry` and the seat counters), and the License Server billing and entitlement shapes (`license-server-types.ts`, with `TLicenseServerBilling`)                                                                                                            |
| `ee/services/license-policy/` | `LicensePolicyService` (the instance's license: cloud, online or offline key, or community; and cloud org plans), with `default-features.ts` (the free tier only), `license-key.ts` (key parsing, offline key shape), entitlement projection (the only place the free tier is applied), feature mapping |
| `ee/clients/license-server/`  | `LicenseServerClient` (entitlements, billing, usage) for both cloud and self-hosted, the self-hosted token provider, error mapping                                                                                                                                                                      |

Rules:

- **Cloud plans are cached under the root org.** A sub-org's plan is its root's. The
  pass-through marker are keyed by root too; the usage reconcile marker stays per org.
- **A plan fetch sends the root org's name and slug.** That's mostly how the License Server learns them, so read
  them fresh each fetch (`findOrganization`), since orgs get renamed.
- **Key names, value formats and queue names are frozen** (`plan-cache.ts`, `usage-report-cache.ts`,
  `UsageQueues`): old pods share them during a rolling deploy. The cached plan's `refreshAt` is a top-level field
  beside the features, not a wrapper, so old pods still read it as a plan.
- **`getPlan` is the only plan read; it serves the cached plan while it refreshes it.** The plan key lives 30
  minutes; past the `refreshAt` stored in it (about 10 minutes before expiry, jittered) `getPlan` still returns it
  and refreshes it in the background
  (`revalidateInBackground`, one caller per root org under the revalidate lock). A failed refresh leaves the
  cached plan in place until it expires. A billing change
  (`refreshPlan` with `afterBillingChange`) only marks the plan for a background refresh; only `closeDeletedOrg` removes
  it. Do not add a second copy of the plan or a "last known plan" read beside it.
- **The free plan is served only when nothing is cached and nothing can be fetched** (unknown org, License Server,
  database or key store failure), and it is never cached, so the next read fetches again. `refreshPlan` throws on
  those failures instead. `getPlan` reads the cache under the given org id before resolving the root, so a root
  org's cached plan is served without the database. A plan has no "fallback" flag: callers trust what `getPlan`
  returns. So a plan outlives a License Server outage by at most its 30 minute TTL; after that a paid org gets the
  free plan (limits, invite caps, session logs) until the server answers. The entitlements call times out after
  5 seconds (`ENTITLEMENTS_TIMEOUT_MS`), since it runs on the request path whenever no plan is cached.
- **The plan carries no usage counts, and no API reports the project count.** The project limit is enforced only
  on the backend, by `lockAndCountWorkspaces` under the create lock; the UI shows the refusal. Project changes do
  not touch the plan cache.
- **`getPlan` returns a `Plan`, which keeps its features private and frozen.** Check a feature with
  `plan.has(PlanFeature.X)` / `plan.assert(PlanFeature.X)`, a product a plan can switch off (null means available)
  with `plan.allows(PlanProduct.X)`, and read data through its getters (`slug`, `rateLimits`, ...). Add a getter only
  for data with no rule attached. `toJSON()` returns a mutable copy for the cache and API responses. Code holding only
  the instance's features wraps them in `Plan.restore(...)` first. A new feature gets a `PlanFeature` member and a `featureNames` entry
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
  call `organizationsService.within(sealKnexTransaction(trx)).lockAndCountBillableOrgActors(scope)`
  inside it, before the insert, and check
  `plan.exceeds(PlanLimit.Identities, SeatUsage.fromBillableActors(counts).identitiesUsed)`. Paths that never locked
  (SSO, SCIM, invites) read `getSeatUsage` before the transaction and call `seatUsage.assertAvailable(plan, via)`
  inside it. `syncSeats` runs after the commit and never throws; code already
  inside a caller's transaction (org/project create) leaves it to the caller.
- **Name a meter with `Meter`, never its key.** `emit`, `countUsage`, `recordMeteringEvents` and `usageCounter` take a
  `Meter` (`Meter.SecretIdentities`). A key arrives as a string only from a queued job or a License Server catalog
  dimension; turn it into a meter once with `Meter.fromKey`, which returns null for a key no meter defines.
- **The two services share the queue, not internals.** `getPlan` asks `UsageQueue.reconcile` to resend a paid
  org's meters, and `reconcile` alone decides whether the org is due (its marker), off `getPlan`'s path;
  `UsageReportService` and `syncSeats` call `getPlan`/`refreshPlan`.
- **Deleted orgs close from the outbox.** Only the `license-org-deleted` consumer
  (`services/org/license-org-deleted-consumer.ts`) calls `closeDeletedOrg`, for root orgs on cloud. It throws so
  the outbox retries; the License Server delete is idempotent.
- **License knows no product.** It sits on `organizationsService` (roots, org reads, billable actors) and `projectsService`
  (workspaces), and builds the two seat meters
  (`identities`, `user_identities`) itself (`seatUsageCounters` in `services/helpers/usage-counters.ts`). Every other meter comes in as a
  `TUsageCounter` from the owning product domain. Organizations and Projects never import License. A meter's
  `scope` picks the reporter: `org-tree` reports at the root, `org` at the org that changed. Metering events
  (`recordMeteringEvents`) follow the same rule, from their meter's scope. Self-hosted reports
  everything once as `self-hosted`, counting the whole instance (`count(null)`).
- **The instance license lives in `InstanceEntitlementsCache`** (in memory, per process), not in a service.
  `LicenseService.refreshInstanceEntitlements` is its only writer, called by the module's background sync and by
  `refreshPlan` on self-hosted. Inside `LicenseService`, read it only through `this.getInstanceEntitlements()`: the
  e2e suite's `overrideLicenseFeatures` spies on that method, so a direct cache read would escape the override.
- **Build it with `LicenseModule.create(deps)`**, which reads the instance license first so nothing runs without
  one. `start()` only registers the usage workers and daily flush. `UsageReportService` stays inside the module: only its queues and cron call it.
- **CE never sees the usage wire format.** The EE client builds the body and idempotency key and maps responses
  to outcomes: `no-license`, `not-priced`, `rejected` are final, anything else throws so the queue retries. A new
  final answer goes in the client, not as a status check in `UsageReportService`.
- **Billing isn't on `TLicenseService`.** It's the EE `LicenseServerClient`, returned by `createDomains` as
  `licenseBilling` and passed only to subscription code.
- **A failed renewal reaches the org as the `subscription_payment_failed` plan notice**, pulled with the plan since
  the License Server never calls us. It drives the org-wide banner and carries no payment link, because every member
  reads the plan; the invoice link stays on the permission-checked billing overview.
- **Offline licenses never hit the License Server** (`LicenseServerClient.fromConfig` stays dormant).
- **Only `license-policy/entitlement-projection.ts` imports `./default-features`, by that exact specifier.** The e2e
  suite aliases it to `e2e-test/fakes/default-features.ts`, so a free tier read anywhere else escapes the
  mock; go through the projection's builders (`communityFeatures`, `cloudPlanFeatures`, ...).
  `.github/workflows/run-backend-bdd-tests.yml` `sed`s feature lines in it by path, so update that workflow if the
  file moves.
- **Tests:** `ce/testing/build-license.ts` builds the module on an in-memory key store and queue, with
  `FakeLicenseServer` (policy and License Server) `FakeOrganizationsService` and `FakeProjectsService`. `testFeatures()` is
  test data, not product defaults. Consumers use `FakeLicenseService` / `FakeUsageMeteringService`; product
  domains read their counters with `usageCounter(module.usageCounters, Meter.X)`.
