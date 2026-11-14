# Domains AGENTS.md

The backend is moving from `src/services/` to domain modules here. New capabilities go here; old services
move over one domain at a time.

A domain owns one business capability end to end (tables, rules, API, tests). Other code only reaches it
through its module. Domain-specific notes go in that domain's own `AGENTS.md`.

## Layout

```
src/domains/
├── domains.ts                  # the only wiring file, builds every module in dependency order
├── lib/                        # shared building blocks, no business logic
├── platform/                   # domains other products depend on
│   ├── license/
│   ├── kms-core/
│   └── organizations-projects/
├── secrets-manager/secrets/    # <product-area>/<domain>
├── pam/pam/
├── agent-vault/agent-vault/
└── certificates/cert-manager/
```

Read a domain's `AGENTS.md` before changing it: [license](platform/license/AGENTS.md),
[organizations-projects](platform/organizations-projects/AGENTS.md), [secrets](secrets-manager/secrets/AGENTS.md),
[pam](pam/pam/AGENTS.md), [agent-vault](agent-vault/agent-vault/AGENTS.md),
[cert-manager](certificates/cert-manager/AGENTS.md), [kms-core](platform/kms-core/AGENTS.md).

`lib/` holds infrastructure every domain uses, one folder per concern. Each folder exports its public API from
`index.ts` and keeps its test doubles in its own `testing/`:

| Folder                     | Exports                                                                                                              | Test doubles                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `lib/errors/`              | `RuleViolationError`, `EntityNotFoundError`, `ExternalSystemError`                                                   |                             |
| `lib/transactions/`        | `TransactionRunner`, `TTransaction`, `TTransactionRunner`, `TStoreLocks`, `sealKnexTransaction`, `unsealTransaction` | `InMemoryTransactionRunner` |
| `lib/key-store/`           | `TDomainKeyStore`                                                                                                    | `InMemoryKeyStore`          |
| `lib/jobs/`                | `TDomainQueue`, `TDomainCron`                                                                                        | `FakeQueue`                 |
| `lib/data-access/`         | `toCount` and other row helpers every store needs                                                                    |                             |
| `lib/testing/integration/` | The Postgres integration harness (`setupIntegration`)                                                                |                             |

Import `@app/domains/lib/<folder>` or `@app/domains/lib/<folder>/testing/<file>`, never a file inside a folder;
lint enforces it. Code goes here only when it has no business rule and a second domain needs it (or will, like
the in-memory runner). Something only one domain uses stays in that domain. A new concern gets a new folder,
not a file at the root of `lib/`.

A domain has `ce/`, `ee/`, or both, with the same layout inside. Nothing else at the root. Code moving from
`src/ee/**` goes to the domain's `ee/`, and a domain may be `ee/` only: everything under an `ee/` path is
EE-licensed, so moving it into `ce/` relicenses it as MIT. That is a maintainer's call, never part of a refactor.

| Path                | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module.ts`         | The module class that builds everything, plus re-exports of the types other code uses. Other domains import only `ce/module.ts`, so a `ce/` domain never depends on an `ee/`-only one                                                                                                                                                                                                                                                           |
| `models/`           | One class per entity or value, with its rules. A file holds the class and its record type (`T<Model>Record`, what `restore()` takes and `toJSON()` returns), nothing else (no request types, key/queue names, helpers). Knows nothing about the DB                                                                                                                                                                                              |
| `data-access/`      | Stores (`<entity>-store.ts`, Postgres) and caches (`<thing>-cache.ts`, key store or memory), each implementing a type from `services/dependencies.ts`. Stores return models                                                                                                                                                                                                                                                                     |
| `clients/<system>/` | Client for an external system, one folder per system. Speaks domain terms at its boundary: builds the request and maps statuses into outcomes, so services never match on status codes. A paid system's client lives in `ee/` and implements a `ce/` type; `ce/` never holds a stand-in                                                                                                                                                         |
| `services/`         | Business logic. One folder per use case group: `services/<name>/service.ts` holds the class (`T<Name>Service`) and its input types, with its unit and integration tests and the helpers only it uses beside it. Helpers two or more services use go in `services/helpers/`. `services/dependencies.ts` holds the store and cache types, the `T<Domain>Stores` bundle included, and what the services need from EE or a domain they can't import |
| `router/`           | Fastify routes: validate, call a service, shape the response                                                                                                                                                                                                                                                                                                                                                                                    |
| `testing/`          | In-memory stores, a `Fake<Name>Service` per service another domain or legacy code calls, contract suites                                                                                                                                                                                                                                                                                                                                        |

## Building blocks

| Piece         | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model         | One per entity, even if stored across several tables. Private constructor taking each field directly as a parameter property (`private readonly offlineLicenseId: string \| null`), never a `props` object; static `create()`/`restore()` take the record and spread it into the constructor, and `toJSON()` rebuilds it. The one exception is a record read by key, like `Plan`'s features (`plan.has(PlanFeature.X)` indexes it), which stays one frozen object. Fields stay private: expose behavior, plus getters for the fields callers need, so nobody reads a raw field the model has a rule for (`plan.has(PlanFeature.Rbac)`, not `plan.rbac`) or mutates it. Never a bare type or function |
| Entity        | Has an id and changes over time. `create()` validates, generates the id and throws `RuleViolationError` for bad input; `restore()` trusts the row. Changes go through intention-revealing methods that enforce the rules and mutate the private fields (`trustedIp.changeAddress(...)`, `membership.deactivate()`), never a generic `update(record)` or a setter; its store then persists the instance                                                                                                                                                                                                                                                                                               |
| Value object  | No id, compared by value, immutable (`Plan` is deep-frozen, `Meter` and `SeatUsage` are readonly). A change returns a new instance. Use one for any value with rules attached: a quota, a key, a scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Store         | One per model (`OrganizationStore`). Owns every table storing that model, returns models not rows. A table belongs to exactly one store; other domains go through the owner's service. Shared query fragments are private methods                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Cache         | Expiring state over the key store or memory (`PlanCache`). Stores keep data durably, caches can lose it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Stores bundle | A domain's stores plus `locks`, bound to one transaction: what `run` hands a service as `stores`. Built inline in `module.ts` and passed to `TransactionRunner`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Service       | Start with one per entity; split when use cases need different deps or callers use one group without the other (`LicenseService` vs `UsageMeteringService`). `class X implements TX`, `TX` is a `type` using method syntax, not arrow props                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Module        | Only `new` calls. Builds everything once and exposes services as-is (typed by their service type) as `readonly <name>Service` fields, named like the service, even when the module has only one (`OrganizationsProjectsModule.organizationsProjectsService`, `LicenseModule.licenseService`). Never wraps a service method                                                                                                                                                                                                                                                                                                                                                                           |
| Router        | `register<Name>Router(server)` in `router/`, registered where the legacy router was (`ee/routes/v<N>/index.ts` or `server/routes/v<N>/index.ts`) under the same prefix. It reads its service from `server.services.<name>Service`, which `routes/index.ts` decorates with `domains.<domain>.<name>Service`.                                                                                                                                                                                                                                                                                                                                                                                          |
| Helpers       | Plain functions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Children: if there are a few and they're always read with the parent, the parent holds them (`Secret` holds
its tags). If there are many and they're read separately, the child is its own entity holding the parent id
(`SecretVersion.secretId`).

### Rich models, not anemic ones

Legacy code keeps data in a bare type (`TSecret`, `TFeatureSet`) and the rules about it in services and
`*-fns.ts` files, so every caller re-implements them and some get them wrong (the old `plan.identityLimit`
reads each had to remember `enforceIdentityLimit` and that 0 means uncapped). Migrating moves those rules onto
the model. The model is the only code that reads its own fields to make a decision.

Signs a model is anemic, and what to do instead:

| Smell                                                                                                            | Instead                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A service or helper branches on a model's field (`if (plan.slug === "enterprise" && plan.enforceIdentityLimit)`) | A method on the model that answers the question (`plan.exceeds(PlanLimit.Identities, used, 1)`)  |
| A public getter or field for every column                                                                        | Getters only for data with no rule attached (`plan.slug`, `meter.key`)                           |
| A setter, or `update(partial)`                                                                                   | One method per change, named for the intent, that checks the rules (`membership.deactivate()`)   |
| The service validates input before `create()`                                                                    | `create()` validates and throws `RuleViolationError`                                             |
| `x-fns.ts` functions taking the record as their first argument                                                   | Methods on the model; what's left (needs `stores` or another domain) goes to `services/helpers/` |
| The same check repeated in several services                                                                      | One model method; services call it and don't re-check                                            |

Where a rule goes:

1. It needs only the entity's own fields: a model method.
2. It needs other rows of this domain (a count, a sibling): the service loads them through `stores`, then asks
   the model (`SeatUsage.fromBillableActors(counts).assertAvailable(plan, via)`).
3. It needs another domain's value: the service reads it before `run` and passes it to the model.

Not everything is a model. A read-only shape with no rules (a count, a breakdown row, `TOrganization` in
`organizations-projects`) stays a plain type in `services/dependencies.ts`. Make it a model the first time a
rule about it shows up.

### State and lifecycle

- State is anything kept for the process lifetime (root key holder, caches, HSM clients). The module builds
  it once in its constructor. Only its owner writes mutable state.
- Constructors (service and module) only store references. No I/O, queries or client creation.
- If a module needs to read something before it can answer (the instance license), give it a private
  constructor and `static async create(deps)` (`LicenseModule.create`). Never a holder that throws until
  something fills it later.
- Anything that runs on its own (workers, crons, timers) goes in `start()`, which `routes/index.ts` calls
  once after `createDomains`. A refresh of this process's own cache, which every pod runs whatever its run mode,
  gets its own method returning a handle that `routes/index.ts` stops on shutdown (`LicenseModule.startBackgroundSync`).
- State never touches the DB. If it must follow a DB change, update it in `tx.afterCommit(...)` so a
  rollback can't leave them out of sync.

### Stores and caches

- Take a connection source, not a handle: `constructor(private readonly knex: () => Knex)`. The module passes
  `() => db.replicaNode()` for the instance the service reads through outside a transaction, and `() => trx`
  for the ones in the stores bundle (`OrganizationsProjectsModule`). `replicaNode()` picks a replica per call, which is
  why it's a function.
- Reads outside `run` go to a replica and can lag. A read that must see a write just made, or that guards a
  write, goes through `run` (or `within(tx)`) so it runs on the primary.
- Convert counts with `toCount` (`lib/data-access/`): Postgres returns `count(*)` as a string.
- Wrap each query in `try/catch` and rethrow `DatabaseError` from `@app/lib/errors` with a `name` saying what
  failed. It's the one class from that file a domain uses.
- Use `TableName` and the row types from `@app/db/schemas`, and helpers from `@app/lib/knex` (`orgTreeIds`).
  Don't port `ormify`: write the queries the type declares, nothing generic.
- Return models (`Model.restore(row)`), `null` for a missing row, and plain shapes only for counts and read-only
  rows (see Rich models).
- A cache is a `<Thing>Cache` class over `TDomainKeyStore` (`lib/key-store/`) or memory, holding its key names
  and TTLs as file-local constants (`PlanCache`). The key store is Redis, not a domain store; the name predates
  domains.

## Transactions

```ts
export class TransactionRunner<TStores> {
  constructor(db: TDbClient, buildStores: (trx: Knex, locks: TStoreLocks) => TStores, parent?: TTransaction);
  within(tx: TTransaction): TransactionRunner<TStores>; // joins tx instead of opening one
  run<T>(work: (ctx: { stores: TStores; tx: TTransaction }) => Promise<T>): Promise<T>;
}
```

The KMS code in this file is a sketch of the shape, not code in the repo; see "Reference code" for real examples.

`run` opens a transaction (or joins the `within(tx)` one) and hands you `stores` bound to it and `tx`, a
sealed token for `afterCommit` and for joining another runner in the same domain. `tx` isn't a Knex handle;
lint keeps `unsealTransaction` inside `data-access/`. `tx` never goes to another domain.

```ts
export class KmsKeyService implements TKmsKeyService {
  constructor(
    private readonly transactionRunner: TransactionRunner<TKmsCoreStores>,
    private readonly state: TKmsCoreState
  ) {}

  generateKmsKey(input: TCreateKmsKeyInput) {
    return this.transactionRunner.run(({ stores }) => createKmsKey(stores, this.state, input));
  }
}

// takes the stores, never a runner, so it can't open a transaction
export const createKmsKey = async (stores: TKmsCoreStores, state: TKmsCoreState, input: TCreateKmsKeyInput) => {
  const key = KmsKey.create({ ...input, encryptedKeyMaterial: wrapNewKeyMaterial(input, state.rootKey.get()) });
  await stores.kmsKeyStore.create(key);
  return key;
};
```

Inside a domain:

- A public service method calls `transactionRunner.run(...)` once. That's the one place deciding the transaction.
- Never call a public service method (any domain) inside `run`: it opens its own `run` and grabs a second
  connection while you hold the first. Share work through helpers that take `stores`. Outside `run`, services
  in the same domain can call each other.
- A store never opens a transaction; multi-table writes rely on the caller's.
- Locks only exist on the stores from `run` (`stores.locks.*`), so a lock outside a transaction doesn't compile.
- Take locks in one order (root key, org, project; key before data key) or you deadlock.
- Models never see a store, cache or transaction.

### Across domains

Calling another domain is a last resort. Before adding one:

1. If you keep needing another domain's data for your own decisions, the boundary is wrong. Move the data
   or rule and raise it in review.
2. If the other domain should react to your change (keys for a new project, cleanup after a delete), emit an
   outbox event in your transaction. Until that event exists, call it after your commit.
3. If you need a value to write your own data (a cipher, a key id, a plan), call it before your `run`.

Domains don't share a transaction by default. A shared one keeps one domain's row locks held while another
works, and with a pool of ~10 connections you get deadlocks Postgres can't see. A cross-domain use case is a
sequence of short, repeatable calls; the exceptions are in "Sharing a transaction" and "KMS Core joins
transactions" below.

```ts
async createSecret(input: TCreateSecretInput) {
  const cipher = await this.kmsKeyService.createCipherPairWithDataKey({ projectId: input.projectId });
  return this.transactionRunner.run(({ stores }) =>
    stores.secretStore.create(Secret.create({ ...input, encryptedValue: cipher.encrypt(input.value) }))
  );
}
```

- Call other domains before `run` or after commit, never inside.
- Only write your own tables. Need to hang data off another domain's row? Use your own table keyed by its id,
  not a new column on theirs (you'd fight over their row locks).
- Don't hold a lock on a row another domain writes while calling another domain.
- Clean up when the owner tells you something is gone (event, or a call for now). No `ON DELETE CASCADE` from
  another domain's table, since that's a write into your tables inside their transaction.
- No network or HSM calls inside a transaction.
- Data that must exist in two domains: call in dependency order, make each write idempotent, let a sweeper
  remove orphans.
- Create-on-first-use: `INSERT ... ON CONFLICT DO NOTHING` in the owner's own short transaction, loser reads
  the winner's row. No advisory lock held across a caller's transaction.
- Replacing a value others may change: compare and swap (`UPDATE ... WHERE value = :expected`, no row = conflict).
- Legacy `src/services/` code reads from a domain before opening its Knex transaction and calls it after
  commit. If that code runs inside a caller's transaction, the caller makes the call after its own commit.

### Sharing a transaction

The runner is a unit of work, so a domain can join a caller's transaction, but only when a check and the
write it guards must be atomic: a plan limit counted under a lock, then the insert. Counting before the
transaction lets concurrent writers pass the limit together, and an import that writes many rows in one
transaction never sees its own rows.

- Only the domain that owns the rows being counted joins. It exposes `within(tx)` returning a narrow type
  with only those methods (`TOrganizationsProjectsTransaction`), never its whole service, so nothing that
  calls the network or opens a connection can run inside. A domain that only supplies a limit or a scope
  (License) hands it over as a value before the transaction and never takes `within(tx)` itself, so one
  transaction never spans two domains.
- Each method takes its lock with `stores.locks.acquire` and reads through `stores`, so the count runs on the
  caller's connection (the primary) and sees the caller's uncommitted rows.
- Legacy code passes `sealKnexTransaction(trx)`. It refuses `afterCommit`, since on a nested Knex
  transaction the only commit it can see is a savepoint release; the caller runs follow-ups after its commit.
- Read everything else (the plan, anything from the License Server) before opening the transaction.
- Every writer of a limit takes the same domain lock. Domain locks hash with `hashtextextended`, legacy
  `PgSqlLock` with a JS hash, so the same name in both is two different locks.
- Prove it with an integration test that runs concurrent writers at limit minus one and fails without the lock.

If something truly has to be atomic across two domains, the boundary is wrong. Move the data into one domain.

### KMS Core joins transactions

KMS Core is the one domain any caller may bring into its transaction, and the rules in "Across domains" that it breaks
(no network call inside a transaction, no advisory lock held across a caller's transaction) are deliberate here. It is
the platform every product encrypts through, so writing ciphertext and creating the key it needs have to commit or
roll back together: a project created with its first secrets, a secret change and its commit, a project deleted with
its keys. Fetching keys before the transaction instead leaves orphan keys or projects when the transaction fails, and
cannot see a project the transaction has just created.

- `dataKeyService.within(tx)` returns `TDataKeyTransaction` (cipher pairs, first use included, the project's KMS key
  id, the certificate key id, `deleteProjectKeys`); `kmsKeyService.within(tx)` returns `TKmsKeyTransaction` (encrypt,
  decrypt, `getKmsById`). Root key, rotation and external KMS management never join.
- First use creates the org or project key under KMS Core's frozen advisory locks, held until the caller commits.
  Keep the transaction short and take locks in KMS Core's order (root key, org, project).
- For a project whose key is in an external KMS (AWS, GCP), the provider call runs inside the caller's transaction,
  as it did before KMS Core was a domain. This is not a precedent for other network calls inside a transaction.
- A joined call never reads or writes KMS Core's Redis cache, so a rollback cannot leave a cache entry naming a key
  that does not exist.
- An error from a joined call leaves the caller's transaction unusable: let it roll back.
- Outside a transaction, call the service directly.

See `platform/kms-core/AGENTS.md` for how the domain does this inside.

## Errors

A domain throws only the kinds in `lib/errors/`, never `BadRequestError` and the rest of `@app/lib/errors`: domains
also run from queues and crons, where a status code means nothing. `toHttpError` (`server/lib/domain-errors.ts`)
maps them at the HTTP boundary.

| Kind                  | Throw when                                                                                                                   | HTTP |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---- |
| `RuleViolationError`  | The caller asked for something the rules refuse: bad input, a limit reached, a feature not on the plan                       | 400  |
| `EntityNotFoundError` | The thing doesn't exist, or belongs to another org or project (same answer, so another tenant's ids don't reveal they exist) | 404  |
| `StateConflictError`  | The request is valid, but the current state prevents it: the name is taken, it is in use, or it changed since it was read    | 409  |
| `ExternalSystemError` | Something the domain depends on failed (the License Server, a cloud API); nothing the caller sent is wrong                   | 500  |

Who throws:

- The model throws `RuleViolationError` for its own rules (`create()`, change methods, `plan.assert`,
  `seatUsage.assertAvailable`). Services don't re-check what the model guarantees.
- A store never throws for a missing row: `find*` returns `null`, and the service turns it into
  `EntityNotFoundError` with the id in the message.
- A client maps a failed call into an outcome or an `ExternalSystemError`; services never match on status codes.
- Permission denied has no kind yet. It arrives with the permissions domain; until then a module that checks
  permissions isn't migrated (see Dependency direction), so don't invent one.

Writing them:

- The message is what the user sees, so say what happened and what to do, in their terms, naming the resource
  and id: "Trusted IP with ID 'x' not found in project 'y'", "Your current plan does not include IP Allowlisting.
  Upgrade your plan to use it." Keep a message the legacy code sent unless the PR lists the change.
- `cause`: the error you caught, so the log keeps it. The user never sees it.
- `details`: structured data the caller can act on (`{ code }` from the License Server). Only `RuleViolationError`
  sends it in the response.
- `name`: only when clients or logs key on a specific error name (`RefreshPlan`); otherwise the HTTP class's
  name is sent.
- A new kind needs an arm in `toHttpError` and in `classifyError` (`lib/errors/classify.ts`) and a row here.
- Legacy code catching `instanceof BadRequestError` or `NotFoundError` won't catch these. When a throw moves into a
  domain, find those catches and switch them to the domain kind.

## Dependency direction

```
router → service → model
            ↑
       data-access → model
```

Arrows mean "imports". Services import nothing that does I/O: they declare needs in `services/dependencies.ts`,
`data-access/` and clients implement those, and `module.ts` wires them. This is what lets services run on
in-memory stores and lets EE plug in without `ce/` importing it.

- `data-access/` and clients import from `services/` only `dependencies.ts` and wire shapes
  (`helpers/license-server-types.ts`), never a service class or helper.
- `models/` imports no other layer.
- `module.ts` imports every layer; nothing imports `module.ts` back. Types a module exposes are defined in the
  service and re-exported.
- Other domains import only `ce/module.ts`. `ce/` never imports `ee/`; only `domains.ts` imports `ee/` from outside.
- Providers are built before the modules that take them. A provider needing the taker's service is a cycle,
  move the boundary.
- A platform domain needing something from products built on it defines a type in its `dependencies.ts` and
  takes implementations in its constructor (`usageCounters: TUsageCounter[]`). `domains.ts` builds products first.
- `ce/module.ts` and what it imports touch `@app/queue`, `@app/keystore/keystore` and `@app/lib/cron/*` only with
  `import type`; `domains.ts` passes the runtime pieces in. Those three are in an import cycle with
  `@app/lib/crypto` and break any test that loads them first. Take them as `TDomainQueue`, `TDomainCron` and
  `TDomainKeyStore` from `lib/`, never a fresh `Pick<>` of the legacy factory.
- No HTTP error classes from `@app/lib/errors` in a domain; see Errors.
- A domain never takes a legacy service or DAL (`src/services/**`, `src/ee/services/**`), and legacy code never
  feeds one in. If a module needs one, migrate that dependency first. That includes authorization: a module that
  checks permissions waits for the permissions domain; don't wrap `permissionService` in an adapter or add a second
  construction phase to get at it. Pure helpers from `@app/lib` (`@app/lib/ip`, the crypto primitives) are fine;
  `@app/lib/request-context` is not, since domains also run from queues and crons.
- Enums and types from a legacy `*-types.ts` (`CertStatus`) may be imported until their owner migrates, then
  they move with it. Never from `@app/ee/**` into `ce/`.
- A domain may read a table no domain owns yet only as a declared exception in its `AGENTS.md`, like
  `organizations-projects`. Prefer adding the read there over a second domain reading the same table.
- Lint (`.oxlintrc.json`, `no-restricted-imports`) enforces all this: one override per layer folder (`models/`,
  `services/`, `data-access/`, `clients/`, `router/`), each repeating the shared patterns because the last matching
  override wins. A new layer folder needs its own override. Test files are exempt from layer order. Imports of
  legacy `@app/ee/**` from `ce/` aren't linted, catch them in review.

## Where new code goes

Inside `ce/` unless it's a paid feature or comes from `src/ee/**` (then the same layer in `ee/`).

| Adding                                                               | Goes in                                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A rule about one entity                                              | `models/`                                                                                                                            |
| A query or write                                                     | A store in `data-access/`, plus its in-memory version in `testing/` and a contract suite case                                        |
| A use case                                                           | `services/`                                                                                                                          |
| Logic two services share                                             | A helper in `services/helpers/` that takes `stores`                                                                                  |
| An endpoint                                                          | `router/`, registered beside the legacy routers (see Router above)                                                                   |
| Something other domains call                                         | A method on the service type, re-exported from `module.ts`                                                                           |
| Something from a store or cache, EE, or a domain that depends on you | A type in `services/dependencies.ts`, passed through the constructor. Anything else from another domain: take its whole service type |
| Cross-request memory                                                 | A state holder built in the module constructor                                                                                       |
| A capability with its own tables                                     | A new domain folder with `ce/`, or `ee/` if its code is EE                                                                           |

## Reference code

Copy these before inventing a shape. Pieces marked "none yet" have no example: the first domain to need one
sets the pattern from the rules above, and its PR names it here.

| Piece                                                                      | Copy                                                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Value object with rules                                                    | `platform/license/ce/models/plan.ts` (`has`/`assert`/`limit`/`exceeds`), `seat-usage.ts`, `meter.ts`       |
| Stores bundle passed to `TransactionRunner`                                | `platform/organizations-projects/ce/module.ts`                                                             |
| Entity, in-memory store, contract suite, router                            | none yet                                                                                                   |
| Store query style on Postgres (returns counts, so no row-to-model mapping) | `platform/organizations-projects/ce/data-access/organization-store.ts`                                     |
| Joining a caller's transaction                                             | `platform/organizations-projects/ce/services/organizations-projects/organizations-projects-transaction.ts` |
| Module with async setup, workers and crons                                 | `platform/license/ce/module.ts`                                                                            |
| EE implementing a `ce/` type, external client                              | `platform/license/ee/`                                                                                     |
| Fake for consumers                                                         | `platform/license/ce/testing/fake-license-service.ts`                                                      |
| A product handing a platform domain its implementation                     | `secrets-manager/secrets/ce/module.ts` (`usageCounters`)                                                   |
| Legacy code calling a domain                                               | any `licenseService: TLicenseService` in `src/services/**`                                                 |

## Migrating a legacy module

Where each legacy piece lands:

| Legacy                                                                         | Becomes                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `xServiceFactory({ deps })` returning an object of arrow functions             | `class XService implements TXService` in `services/x/service.ts`, deps as constructor parameter properties. Split it by use case group if callers use halves (see Service) |
| `x-dal.ts` (`ormify` plus custom queries, optional `tx?: Knex` on each method) | One `<Entity>Store` per model in `data-access/`, typed in `services/dependencies.ts`. The `tx` parameter goes: the stores bundle from `run` supplies the connection        |
| `x-types.ts`                                                                   | DTOs become the service's input types (in its `service.ts`), the entity shape becomes the model's `T<Model>Record`, enums go to the model that owns the concept            |
| `x-fns.ts`                                                                     | Rules about one entity become model methods; the rest go to `services/helpers/` taking `stores`                                                                            |
| `x-queue.ts`                                                                   | Workers and crons registered in the module's `start()`, each calling a service method. Queue and job names stay                                                            |
| `keyStore` reads and writes in the service                                     | A `<Thing>Cache` in `data-access/`                                                                                                                                         |
| `BadRequestError` / `NotFoundError` / `ConflictError`                          | `RuleViolationError` / `EntityNotFoundError` (see Errors)                                                                                                                  |
| `permissionService`                                                            | Blocked until the permissions domain exists (see Dependency direction)                                                                                                     |
| Wiring in `server/routes/index.ts`                                             | `new` in the module, the module built in `domains.ts`                                                                                                                      |

1. Check its dependencies. Every legacy service or DAL it calls must already be a domain, or be one this module
   will own (see Dependency direction). Otherwise migrate that first, or stop.
2. Place it: `<product-area>/<domain>/`, or `platform/` if other domains depend on it, named for the capability.
   Code from `src/ee/**` goes to `ee/`.
3. Keep the contract: URLs, methods, status codes, response shapes, error messages, audit event types and
   metadata, queue and key names (old pods share them during a rolling deploy), and table names (migrations stay
   in `src/db/migrations`, row types in `@app/db/schemas`). Any change, including a 500 becoming a 404, is listed in
   the PR for the author to accept (`backend/CODE_QUALITY.md`), never made silently. Move first, fix later:
   keep the legacy behavior in the move, including how failures degrade (what threw, what served a fallback,
   which database a read hit), and put a deliberate behavior change in its own commit the PR names.
4. Move rules out of the service into the model, queries into stores, and `BadRequestError` /
   `NotFoundError` into domain errors. A plan check reads the plan before `run` and refuses with
   `plan.assert(PlanFeature.X)`; never gate a read or a delete.
5. Wire it: build the module in `domains.ts`, hand its services to legacy callers from `domains.<domain>` in
   `routes/index.ts`, and replace the legacy factory everywhere. Delete the old service, DAL and types. Point the
   `server.services` entry and its `@types/fastify.d.ts` type at the domain service (`<name>Service`).
6. Test it: model and service unit tests on in-memory stores, the store contract suite, integration
   specs for SQL and locks, a `Fake<Name>Service` if anything else calls it, and a blackbox plan in `tests/` for
   every API change.
7. Add the domain's `AGENTS.md` (what it owns, declared exceptions) and link it from the list at the top of this file.
8. Fix every path that named the old files: `vitest.e2e.config.mts` aliases, `.github/workflows/*` that `sed`
   a source file, `backend-go/tests/infra/builder.go` (it patches the compiled file inside the published
   image), docs, and test failure messages. `git grep` the old file names before calling it done.
9. Run `make reviewable-api`, `npm run test:unit -- src/domains`, `npm run test:integration`, and the e2e specs
   for the routes you touched (`make test-api-e2e SPEC=<pattern>`).

## Class conventions

- Every model, service, store, cache and client is a `class`. Legacy factory functions returning
  objects of closures don't come over.
- `class X implements TX`, with `TX` a `type` (not an `interface`) in method syntax (`getPlan(orgId: string): Promise<Plan>;`),
  so a fake can implement the same type. Models have no type of their own: callers use the class.
- Dependencies are constructor parameter properties, `private readonly`. Public state is a `readonly` field
  (`LicenseModule.licenseService`). Nothing is reassigned after construction except state its owner mutates.
- Methods are methods, not arrow-function properties. Test fakes may use arrow properties so a test can
  override one (`FakeOrganizationsProjectsService`).
- A helper only one class uses is a `private` method; a pure function only one file uses is a file-local
  `const`. Shared helpers are exported plain functions in `services/helpers/`.
- Static constructors, never `new` from outside the class: `create(record)` (validates), `restore(record)`
  (trusts stored data), `from<Source>(...)` to build from another shape (`SeatUsage.fromBillableActors`,
  `Meter.fromKey`), and `static async create(deps)` for a module that must read before it can answer.
- A fixed set of named things is an `enum` (`PlanFeature`, `PlanLimit`) or, when each member carries data,
  static readonly instances on the class (`Meter.SecretIdentities`). Key, lock and queue names are file-local
  `const` maps (`PlanKeys`, `CountLocks`), not exported.

## Naming

| Kind             | Pattern                                                                                                                                                                                                                                                                                                                                                  | Example                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Folder           | kebab-case noun                                                                                                                                                                                                                                                                                                                                          | `static-secrets`                                                                  |
| Model            | `models/<entity>.ts`, class `<Entity>`, record `T<Entity>Record`                                                                                                                                                                                                                                                                                         | `instance-entitlements.ts`, `InstanceEntitlements`, `TInstanceEntitlementsRecord` |
| Store            | `data-access/<entity>-store.ts`, `class <Entity>Store implements T<Entity>Store`                                                                                                                                                                                                                                                                         | `OrganizationStore`                                                               |
| Cache            | `data-access/<thing>-cache.ts`, `class <Thing>Cache implements T<Thing>Cache`                                                                                                                                                                                                                                                                            | `PlanCache`                                                                       |
| Client           | `clients/<system>/client.ts`, `class <System>Client`; its error mapping in `errors.ts` beside it                                                                                                                                                                                                                                                         | `LicenseServerClient`                                                             |
| Test doubles     | `testing/fake-<name>.ts` → `Fake<Name>`, `testing/in-memory-<name>.ts` → `InMemory<Name>`, rows for integration tests in `testing/<thing>-fixture.ts`, a module on fakes in `testing/build-<domain>.ts` → `build<Domain>()`                                                                                                                              | `FakeLicenseService`, `build-license.ts`                                          |
| Module           | `<Domain>Module` in `ce/module.ts`, `<Domain>EeModule` in `ee/module.ts`                                                                                                                                                                                                                                                                                 | `StaticSecretsModule`                                                             |
| Service          | `class <Name>Service implements T<Name>Service`: both the class and its type end in `Service`. That holds for every class in `services/<name>/service.ts`, including one that queue jobs or a cron call and an EE class implementing a CE type. Name it for what it does, not how it is triggered (`UsageReportService`, not `UsageReportWorkerService`) | `LicenseService`, `UsageReportService`, `LicensePolicyService`                    |
| Service as a dep | Always `<name>Service: T<Name>Service`, whole type, never a `Pick<>` or a short name like `license`                                                                                                                                                                                                                                                      | `licenseService: TLicenseService`                                                 |
| Service deps     | Constructor parameter properties (`private readonly planCache: TPlanCache`), one per dependency, never a deps object. Only the module calls `new`, so the order is checked in one place                                                                                                                                                                  | `LicenseService`                                                                  |
| Dependency name  | The type's name without the `T`, in camelCase, so a field says what it holds: `counterRegistry: CounterRegistry`, `organizationStore: TOrganizationStore`, `transactionRunner: TTransactionRunner<...>`. Infrastructure handles keep the names the backend uses everywhere (`db`, `knex`, `trx`, `keyStore`, `queueService`)                             | `planCache: TPlanCache`                                                           |
| Module deps      | `T<Name>Deps`, named, beside the module, never inline: `domains.ts` passes it as an object                                                                                                                                                                                                                                                               | `TLicenseDeps`                                                                    |
| Dependency type  | Named for what the service needs                                                                                                                                                                                                                                                                                                                         | `TPlanCache`, `TUsageCounter`                                                     |
| Stores bundle    | `T<Domain>Stores` in `services/dependencies.ts` (the service's runner needs it, and `services/` can't import `data-access/`), one field per store named like its type without the `T` (`organizationStore: TOrganizationStore`, the Dependency name rule), plus `locks`; the run context field is `stores`                                               | `TOrganizationsProjectsStores`                                                    |
| Transaction arg  | `tx: TTransaction`                                                                                                                                                                                                                                                                                                                                       |                                                                                   |
| Service file     | `services/<name>/service.ts`; the folder carries the name                                                                                                                                                                                                                                                                                                | `license/service.ts`                                                              |
| Tests            | `<file>.test.ts` (unit), `<file>.integration-test.ts` (integration), beside the code                                                                                                                                                                                                                                                                     | `service.test.ts`                                                                 |

## Testing

Same philosophy as the blackbox suite (`tests/docs/writing-tests.md`): test (operation, outcome) pairs a
caller depends on, not line coverage.

| Layer                                 | Tests                                                                                                       | Uses                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Unit (`*.test.ts`)                    | Model rules, helpers, service use cases, input matrices                                                     | In-memory stores and `InMemoryTransactionRunner`, no DB or network |
| Integration (`*.integration-test.ts`) | Things only Postgres proves: SQL, store contract, locks, rollback, `within(tx)`, `afterCommit`, concurrency | Real stores on real Postgres via the harness                       |
| Not here                              | HTTP responses, queue/cron effects, the full server                                                         | `tests/` and `e2e-test/`                                           |

Rules:

- Assert observable outcomes (what the stores hold, return values, errors), not that a fake got called, unless the
  call is the outcome.
- `describe("<Class>.<method>")` + `test("should <outcome> [when <condition>]")`, lowercase.
- Body is `// Setup`, `// Action`, `// Assert`. Roughly eight setup lines, one action, one to three asserts.
  Long setup means a missing helper in `testing/`.
- Cover failures (refused, not found, other org's resource, conflict, repeat, concurrent, rollback). A
  rejection test also checks nothing changed. Assert messages when they're part of the contract.
- Each test makes its own data with fresh ids. Per-test state in the test or `beforeEach`, never `beforeAll`.
- Never sleep.
- Fakes must behave like the real thing, one class per file in `testing/`. The contract suite enforces it for
  in-memory stores: `testing/<entity>-store-contract.ts` exports
  `describe<Entity>StoreContract(name, setup)`, run by a unit test against the in-memory class and by an
  integration test against Postgres, so both pass the same cases.
- Break the code and watch the test fail before calling it done.

### Unit tests

Build services directly with in-memory state, `InMemory<Entity>Store` classes bundled like the module bundles the
real ones, and `InMemoryTransactionRunner`. The runner acts like a real transaction: restores the stores snapshot on throw, runs `afterCommit` only on
success, joins with `within(tx)`, and locks are per-key mutexes. Consumers of a domain use its
`Fake<Name>Service`, never a hand-rolled mock.

### Integration tests

The harness (`lib/testing/integration/`) gives a test a migrated Postgres and any other server it asks for.
No Fastify, queues or license server. Files run in parallel.

```bash
npm run test:integration                  # from backend/, needs Docker
npm run test:integration -- kms-key       # one file
make test-api-integration SPEC=kms-key    # same, from repo root
```

```ts
describe("KmsKeyService.generateKmsKey", () => {
  const h = setupIntegration();

  test("should refuse a duplicate key name in the same org", async () => {
    // Setup
    const tn = await h.newTenant();
    const kms = new KmsCoreModule({ db: h.db, hsm: new FakeHsm() });
    await kms.service.generateKmsKey({ orgId: tn.org.id, name: "k1" });

    // Action
    const result = kms.service.generateKmsKey({ orgId: tn.org.id, name: "k1" });

    // Assert
    await expect(result).rejects.toThrow("already exists");
  });
});
```

| `h.`            | Gives                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| `db`            | Knex on this describe's DB (`primaryNode()`/`replicaNode()` resolve to it)           |
| `newTenant()`   | New org, admin user, one project with dev/staging/prod                               |
| `factories`     | Single rows: `user`, `organization`, `orgMembership`, `project`, `projectMembership` |
| `newDatabase()` | Empty DB on the same server, dropped after the test                                  |

- Only read `h.*` inside tests and hooks; reading it at describe time throws.
- Factories only insert platform rows no domain owns yet. Create a domain's rows through its module so its
  rules run.
- Sharing: Postgres server and a fully migrated template DB once per run (template named by a hash of
  `src/db/migrations`, reused across runs on a long-lived `INTEGRATION_POSTGRES_URL`); a clone per worker
  (`infisical_it_<run>_w<n>`); a tenant per test. Other servers: one container per run, a namespace (an OU, say)
  per test.
- Nothing starts until asked for. `startOnce(name, start)` (`harness.ts`) lets the first caller start a server
  while other workers wait on a lock and reuse its address.
- Changing instance-wide state (root key, server config)? Use `setupIntegration({ freshDatabase: true })` for a
  private clone.
- Harness only creates/drops DBs named `infisical_it_*`. Global teardown removes the run's labelled containers
  and DBs (the worker that started one may exit while others still use it).
- Never call `initDbConnection()` here: it registers global `primaryNode()`/`replicaNode()` once per process.

#### Adding a server

One file in `lib/testing/integration/servers/`:

```ts
const startLdapServer = async (): Promise<TLdapServer> => {
  const started = await container("<image>:<exact tag>")
    .withExposedPorts(389)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  return { host: started.getHost(), port: started.getMappedPort(389), containerId: started.getId() };
};

export const setupLdap = () => {
  let server: TLdapServer | undefined;
  beforeAll(async () => {
    server = await startOnce("ldap", startLdapServer);
  });
  return {
    async newOrgUnit() {
      const ou = `ou=t${randomId()},dc=it`;
      // create it on `server`, and remove it after the test
      onTestFinished(() => deleteOrgUnit(server!, ou));
      return { ...server!, baseDn: ou };
    }
  };
};
```

- `start<Name>()` returns a plain JSON address (host, port, container id, creds), never a live client, since it
  crosses processes.
- `new<Thing>()` makes a namespace no other test uses and removes it in `onTestFinished`. Put per-test options
  here, not in a second server.
- Pin an exact image tag and check it can actually do per-test namespaces (an sshd running unprivileged can only
  log in one user, for example).

Run the suite three times before calling it done. Failures that only show on reruns mean state is leaking.
