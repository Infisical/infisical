# License domain

Answers what an org may use (`getPlan`, `assertFeature`), what the instance's own license is
(`getInstanceEntitlements`), and reports metered usage to the License Server. Owns no tables: its state
is the plan cache in the key store and the usage queues.

| Layer | Holds |
| --- | --- |
| `ce/model/` | `Plan`, `InstanceEntitlements`, `SeatUsage`, `Meter`: classes only |
| `ce/data-access/` | `PlanCache` and `UsageReportMemory`, both in the key store, with their key names |
| `ce/license-server-client/` | `TLicenseServerClient` (what the domain asks of the License Server), its request and response types, and `DormantLicenseServerClient` for the community edition |
| `ce/service/` | The business logic (`PlanResolver`, `UsageQueue`, the services), using data access and the client; the contracts others implement (`TLicenseHooks`, `TUsageCounter`, `TLicenseOrganizations`) |
| `ee/license-server-client/` | `LicenseServerClient`: HTTP backends, tokens and usage posts |
| `ee/service/` | The EE logic behind `TLicenseHooks`: reading the license key, projecting entitlements into a plan |

- **Cloud plans are cached under the root org.** A sub-org's plan is its root's; `OrganizationDirectory` maps an
  org to its root once per process. Last-known plan, fallback marker and pass-through marker are keyed by the
  root too. The usage reconcile marker stays per org.
- **Key names, TTLs and queue names are frozen** (`data-access/plan-cache.ts`, `data-access/usage-report-memory.ts`,
  `UsageQueues` in `service/usage-queue.ts`): pods of the previous release read the same cache and run the same
  jobs during a rolling deploy.
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
  owns the data) and `registerOrganizations` (root orgs and workspace counts, from organizations-projects,
  exactly once). A meter's `scope` decides the report identity: `org-tree` reports at the root, `org` at the
  org that changed. Self-hosted reports everything once, as `self-hosted`, counting the whole instance
  (`count(null)`).
- **Services share collaborators, not each other.** `PlanResolver` (plan reads, refresh, background
  revalidation) and `UsageQueue` (emit, reconcile, metering events) are built once and handed to the services
  that need them.
- **No caller's transaction reaches License.** It has no `within(tx)`, and counters take no transaction.
  A seat limit is enforced by reading `getSeatUsage` (or `getInstanceSeatUsage` for an instance-wide limit)
  before the caller opens its transaction and checking it with `seatUsage.assertAvailable(...)` inside it.
- **An offline license never reaches the License Server**: `LicenseServerClient.fromConfig` stays dormant for
  it. The EE instance resolver imports `getDefaultOnPremFeatures` and `getLicenseKeyConfig` through the exact
  specifier `./license-fns`: the e2e suite aliases it to `src/ee/services/license/__mocks__/license-fns.ts`.
- Tests: `ce/testing/build-license.ts` builds the module over an in-memory key store and queue with
  `FakeLicenseServerClient` and `FakeLicenseHooks`; consumers use `FakeLicenseDomain`; a product domain's test
  reads what it registered through `FakeLicenseRegistry`.
