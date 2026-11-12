# License domain

Two services on one module. `LicenseModule.service` (`licenseService: TLicenseService`) is entitlements: what
an org may use (`getPlan`, then `plan.has` / `plan.assert`), the instance's own license
(`getInstanceEntitlements`) and seat usage. `LicenseModule.usageMeteringService`
(`usageMeteringService: TUsageMeteringService`) reports metered usage to the License Server: `emit`,
`recordMeteringEvents`, `countUsage`, `syncSeats`. Take only the one a caller uses. Owns no tables: its state
is the plan cache in the key store and the usage queues.

**CE holds the mechanism, EE holds licensing policy.** CE caches plans, queues and sends usage reports, counts
usage and checks a plan against a feature. EE decides: the free tier's features (`getDefaultOnPremFeatures` in
`ee/service/license-fns.ts`), reading and verifying license keys, turning License Server entitlements into a
plan, and talking to the License Server. EE plugs in by implementing the types in `ce/service/dependencies.ts`
(`TLicenseProvider` is `LicenseResolver`, `TLicenseServer` is `LicenseServerClient`), which `LicenseModule` requires.
Never add defaults or a fallback for them to `ce/`: a copy of the free tier in MIT code is a copy anyone
may edit into a paid one.

| Layer | Holds |
| --- | --- |
| `ce/model/` | `Plan`, `InstanceEntitlements`, `SeatUsage`, `Meter`: classes only, with no feature data. `Plan` exposes its props as read-only fields (`withProps`) |
| `ce/data-access/` | `PlanCache` and `UsageReportCache`, both in the key store, with their key names; they implement `TPlanCache` and `TUsageReportCache` |
| `ce/service/` | The mechanism: `LicenseService` (plans, refresh, seats, closing deleted orgs), `UsageMeteringService` (what callers report usage through), `UsageQueue` (putting usage on the queues), `UsageReportWorker` (what the queues and the daily flush run), and `dependencies.ts`: what the services need from their data access, the products (`TUsageCounter`) and EE |
| `ce/service/license-server-types/` | The License Server's request and response shapes, which `TLicenseServerBilling` and the dependency types expose |
| `ee/service/` | The policy behind `TLicenseProvider`: default features and license key parsing (`license-fns.ts`), the license resolver, entitlement projection and its feature mapping |
| `ee/license-server-client/` | `LicenseServerClient`, the only client (entitlements, billing, usage posts), its HTTP backends and token provider |

- **Cloud plans are cached under the root org.** A sub-org's plan is its root's; the organizations-projects service maps an
  org to its root and caches it for the life of the process. Last-known plan, fallback marker and pass-through marker are keyed by the
  root too. The usage reconcile marker stays per org.
- **A plan fetch names the root org.** `fetchPlan` sends its name and slug, which the License Server stores in
  its org directory; apart from an admin backfill, this is how it learns them. They are read fresh on each fetch (`findOrganization`), never
  cached with the root id, because an org can be renamed.
- **Key names, TTLs and queue names are frozen** (`data-access/plan-cache.ts`, `data-access/usage-report-cache.ts`,
  `UsageQueues` in `service/usage-queue.ts`): pods of the previous release read the same cache and run the same
  jobs during a rolling deploy.
- **Only a License Server failure writes the fallback plan** (`LicenseService.fetchPlanOrFallback`): the fallback
  marker means the License Server could not answer. A database or key store error is thrown, so it never
  overwrites a cached paid plan.
- **`getPlan` returns the `Plan` entity.** Callers read its fields (`plan.rbac`) and use its rules (`has`, `assert`,
  `isPaid`); it still passes wherever `TPlanProps` is expected. Never mutate it.
- **Keep `ce/module.ts` cheap to import.** Consumers import values from it (`Plan`, `Meter`, `InstanceType`),
  and `@app/queue`, `@app/keystore/keystore` and `@app/lib/cron/*` sit in an import cycle with
  `@app/lib/crypto`. Reference them with `import type` only; runtime pieces such as the timer are passed in by
  `domains.ts`.
- **Seat sync runs after the commit.** `usageMeteringService.syncSeats` reports the seat count, refreshes the
  plan and never throws. Code that runs inside a caller's transaction (org create, project create) leaves the
  call to that caller, after its commit.
- **The two services share the queue, not each other's internals.** `getPlan` asks `UsageQueue.reconcile` to
  re-send an active paid org's meters; `UsageReportWorker` and `syncSeats` call `licenseService.getPlan` and
  `refreshPlan`. Neither holds a transaction, so the calls are plain.
- **Closing a deleted org runs after the delete, from the outbox.** `closeDeletedOrg` is called only by the
  `license-org-deleted` consumer (`services/org/license-org-deleted-consumer.ts`) for a deleted root org on
  cloud, and throws every failure so the outbox retries; the License Server's delete is safe to repeat.
- **License sits on organizations-projects and knows no product.** It takes `organizationsProjectsService`
  whole (root org ids, workspace counts, seat counts) and builds the two seat meters, `identities` and
  `user_identities`, itself (`service/seat-usage-counters.ts`), from the same count `getSeatUsage` uses. Every
  other meter comes in as `usageCounters`: one `TUsageCounter` per `Meter`, from the product domain that owns
  the data, which `domains.ts` builds first. organizations-projects never imports License.
  A meter's `scope` decides the report identity: `org-tree` reports at the root, `org` at the org that
  changed. Self-hosted reports everything once, as `self-hosted`, counting the whole instance (`count(null)`).
- **Workers are on neither service type.** `UsageReportWorker` (`handleUsageEvent`, `handleMeteringEvents`,
  `flushInstanceUsage`) is built by the module and registered only in `LicenseModule.start()`.
- **Billing is not on `TLicenseService`.** It is the EE `LicenseServerClient`, which `createDomains` returns as
  `licenseBilling` and is passed only to the code that manages subscriptions (`licenseBilling: TLicenseServerBilling`).
- **No caller's transaction reaches License.** Neither its service nor the counters take a transaction.
  A seat limit is enforced by reading `getSeatUsage` (or `getInstanceSeatUsage` for an instance-wide limit)
  before the caller opens its transaction and checking it with `seatUsage.assertAvailable(...)` inside it.
- **An offline license never reaches the License Server**: `LicenseServerClient.fromConfig` stays dormant for
  it. EE reads the default features and `getLicenseKeyConfig` only through the exact specifier `./license-fns`:
  the e2e suite aliases it to `src/ee/services/license/__mocks__/license-fns.ts`.
  `.github/workflows/run-backend-bdd-tests.yml` also rewrites feature lines in that file by path with `sed`;
  update it when the file moves.
- Tests: `ce/testing/build-license.ts` builds the module over an in-memory key store and queue with
  `FakeLicenseServer`, which plays both the provider and the License Server, and `FakeOrganizationsProjectsService`; `testFeatures()` is test data, not
  the product's defaults. Consumers use `FakeLicenseService` and `FakeUsageMeteringService`; a product domain's test reads the counters it
  built with `usageCounter(module.usageCounters, key)`.
