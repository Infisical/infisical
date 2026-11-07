# License domain

Answers what an org may use (`getPlan`, `assertFeature`), what the instance's own license is
(`getInstanceEntitlements`), and reports metered usage to the License Server. Owns no tables: its state
is the plan cache in the key store and the usage queues.

- **Cloud plans are cached under the root org.** A sub-org's plan is its root's; `RootOrgCache` maps an
  org to its root once per process, so a cache hit costs one MGET. Last-known plan, fallback marker and
  pass-through marker are keyed by the root too. The usage reconcile marker stays per org.
- **Key names, TTLs and queue names are frozen** (`model/plan-cache-keys.ts`, `model/usage-queues.ts`):
  pods of the previous release read the same cache and run the same jobs during a rolling deploy.
- **Keep `ce/module.ts` cheap to import.** Consumers import values from it (`Plan`, meters,
  `InstanceType`), and `@app/queue`, `@app/keystore/keystore` and `@app/lib/cron/*` sit in an import cycle
  with `@app/lib/crypto`. Reference them with `import type` only; runtime pieces such as the timer are
  passed in by `domains.ts`.
- **Seat sync runs after the commit.** `syncSeats` calls the License Server and never throws. Code holding
  a Knex transaction schedules it with `sealKnexTransaction(trx).afterCommit(...)`.
- **Cancellation runs before the org is deleted.** Any 4xx means there is nothing to cancel; anything
  else is thrown so the delete stops.
- **Counters come from the owning domains** (`TUsageCounter`), passed to the module's constructor by
  `domains.ts`. A counter's `scope` decides the report identity: `org-tree` reports at the root, `org` at
  the org that changed. Self-hosted reports everything once, as `self-hosted`, counting the whole
  instance (`count(null)`).
- **EE** (`ee/`) reads `LICENSE_KEY`, talks to the License Server and signs nothing. The instance resolver
  imports `getDefaultOnPremFeatures` and `getLicenseKeyConfig` through the exact specifier
  `./license-fns`: the e2e suite aliases it to `src/ee/services/license/__mocks__/license-fns.ts`.
- Tests: `ce/testing/build-license.ts` builds the module over an in-memory key store and queue with
  `FakeLicenseHooks`; consumers use `FakeLicenseService`.
