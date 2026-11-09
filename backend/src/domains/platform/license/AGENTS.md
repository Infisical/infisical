# License domain

Answers what an org may use (`getPlan`, `assertFeature`), what the instance's own license is
(`getInstanceEntitlements`), and reports metered usage to the License Server. Owns no tables: its state
is the plan cache in the key store and the usage queues.

**CE holds the mechanism, EE holds licensing policy.** CE caches plans, queues and sends usage reports, counts
usage and checks a plan against a feature. EE decides: the free tier's features (`getDefaultOnPremFeatures` in
`ee/service/license-fns.ts`), reading and verifying license keys, turning License Server entitlements into a
plan, and talking to the License Server. EE plugs in through `TLicenseHooks`, which `LicenseModule` requires.
Never add defaults or a fallback for the hooks to `ce/`: a copy of the free tier in MIT code is a copy anyone
may edit into a paid one.

| Layer | Holds |
| --- | --- |
| `ce/model/` | `Plan`, `InstanceEntitlements`, `SeatUsage`, `Meter`: classes only, with no feature data |
| `ce/data-access/` | `PlanCache` and `UsageReportCache`, both in the key store, with their key names |
| `ce/service/` | The mechanism, using data access and the hooks: `PlanService` (plans, refresh, seat sync, cancellation), `UsageService` (live counts and the usage workers), `UsageQueue` (putting usage on the queues). Also `TLicenseHooks` and the registrations products implement (`TUsageCounter`, `TLicenseOrganizations`) |
| `ce/service/license-server-types/` | The License Server's request and response shapes, which `billing` and the hooks expose |
| `ee/service/` | The policy behind `TLicenseHooks`: default features and license key parsing (`license-fns.ts`), the license resolver, entitlement projection and its feature mapping |
| `ee/license-server-client/` | `LicenseServerClient`, the only client (entitlements, billing, usage posts), its HTTP backends and token provider |

- **Cloud plans are cached under the root org.** A sub-org's plan is its root's; `OrganizationDirectory` maps an
  org to its root once per process. Last-known plan, fallback marker and pass-through marker are keyed by the
  root too. The usage reconcile marker stays per org.
- **Key names, TTLs and queue names are frozen** (`data-access/plan-cache.ts`, `data-access/usage-report-cache.ts`,
  `UsageQueues` in `service/usage-queue.ts`): pods of the previous release read the same cache and run the same
  jobs during a rolling deploy.
- **Only a License Server failure writes the fallback plan** (`PlanService.fetchPlanOrFallback`): the fallback
  marker means the License Server could not answer. A database or key store error is thrown, so it never
  overwrites a cached paid plan.
- **`getPlan` returns plain data** (`TPlanProps`, from `plan.toJSON()`). Inside the domain, work with `Plan`.
- **Keep `ce/module.ts` cheap to import.** Consumers import values from it (`Plan`, `Meter`, `InstanceType`),
  and `@app/queue`, `@app/keystore/keystore` and `@app/lib/cron/*` sit in an import cycle with
  `@app/lib/crypto`. Reference them with `import type` only; runtime pieces such as the timer are passed in by
  `domains.ts`.
- **Seat sync runs after the commit.** `syncSeats` calls the License Server and never throws. Code that runs
  inside a caller's transaction (org create, project create) leaves the call to that caller, after its commit.
- **Cancellation runs before the org is deleted.** Any 4xx means there is nothing to cancel; anything
  else is thrown so the delete stops.
- **License is built first and knows no product.** Products plug in through `LicenseModule.registry`
  while `domains.ts` builds them: `registerUsageCounter` (one `TUsageCounter` per `Meter`, from the domain that
  owns the data) and `registerOrganizations` (root org ids, workspace counts and seat counts, from organizations-projects,
  exactly once). A meter's `scope` decides the report identity: `org-tree` reports at the root, `org` at the
  org that changed. Self-hosted reports everything once, as `self-hosted`, counting the whole instance
  (`count(null)`).
- **`UsageService` reads plans through `PlanService`** (its worker skips an org with no paid plan). That is the
  one service-to-service call, and it is safe because License opens no transactions. `PlanService` never calls
  `UsageService`: what both need from the queues is in `UsageQueue`.
- **No caller's transaction reaches License.** It has no `within(tx)`, and counters take no transaction.
  A seat limit is enforced by reading `getSeatUsage` (or `getInstanceSeatUsage` for an instance-wide limit)
  before the caller opens its transaction and checking it with `seatUsage.assertAvailable(...)` inside it.
- **An offline license never reaches the License Server**: `LicenseServerClient.fromConfig` stays dormant for
  it. EE reads the default features and `getLicenseKeyConfig` only through the exact specifier `./license-fns`:
  the e2e suite aliases it to `src/ee/services/license/__mocks__/license-fns.ts`.
  `.github/workflows/run-backend-bdd-tests.yml` also rewrites feature lines in that file by path with `sed`;
  update it when the file moves.
- Tests: `ce/testing/build-license.ts` builds the module over an in-memory key store and queue with
  `FakeLicenseHooks`, which also plays the License Server; `testFeatures()` is test data, not the product's
  defaults. Consumers use `FakeLicenseDomain`; a product domain's test reads what it registered through
  `FakeLicenseRegistry`.
