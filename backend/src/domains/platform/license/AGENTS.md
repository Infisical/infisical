# License domain

Answers what an org may use (`getPlan`, `assertFeature`), what the instance's own license is
(`getInstanceEntitlements`), and reports metered usage to the License Server. Owns no tables: its state
is the plan cache in the key store and the usage queues.

- **Cloud plans are cached under the root org.** A sub-org's plan is its root's; `OrganizationDirectory` maps an
  org to its root once per process, so a cache hit costs one MGET. Last-known plan, fallback marker and
  pass-through marker are keyed by the root too. The usage reconcile marker stays per org.
- **Key names, TTLs and queue names are frozen** (`model/plan-cache-keys.ts`, `model/usage-queues.ts`):
  pods of the previous release read the same cache and run the same jobs during a rolling deploy.
- **Keep `ce/module.ts` cheap to import.** Consumers import values from it (`Plan`, meters,
  `InstanceType`), and `@app/queue`, `@app/keystore/keystore` and `@app/lib/cron/*` sit in an import cycle
  with `@app/lib/crypto`. Reference them with `import type` only; runtime pieces such as the timer are
  passed in by `domains.ts`.
- **Seat sync runs after the commit.** `syncSeats` calls the License Server and never throws. Code that runs
  inside a caller's transaction (org create, project create) leaves the call to that caller, after its commit.
- **Cancellation runs before the org is deleted.** Any 4xx means there is nothing to cancel; anything
  else is thrown so the delete stops.
- **License is built first and knows no product.** Products plug in through `LicenseModule.registry`
  while `domains.ts` builds them: `registerUsageCounter` (one `TUsageCounter` per metered dimension, from the
  domain that owns the data) and `registerOrganizations` (root orgs and workspace counts, from
  organizations-projects, exactly once). A counter's `scope` decides the report identity: `org-tree` reports
  at the root, `org` at the org that changed. Self-hosted reports everything once, as `self-hosted`,
  counting the whole instance (`count(null)`).
- **Services share collaborators, not each other.** `PlanResolver` (plan reads, refresh, background
  revalidation) and `UsageQueue` (emit, reconcile, metering events) are built once and handed to the services
  that need them.
- **No caller's transaction reaches License.** It has no `within(tx)`, and counters take no transaction.
  A seat limit is enforced by reading `getSeatUsage` (or `getInstanceSeatUsage` for an instance-wide limit)
  before the caller opens its transaction and checking it with `assertSeatAvailable` inside it.
- **EE** (`ee/`) reads `LICENSE_KEY`, talks to the License Server and signs nothing. The instance resolver
  imports `getDefaultOnPremFeatures` and `getLicenseKeyConfig` through the exact specifier
  `./license-fns`: the e2e suite aliases it to `src/ee/services/license/__mocks__/license-fns.ts`.
- Tests: `ce/testing/build-license.ts` builds the module over an in-memory key store and queue with
  `FakeLicenseHooks`; consumers use `FakeLicenseDomain`; a product domain's test reads what it registered
  through `FakeLicenseRegistry`.
