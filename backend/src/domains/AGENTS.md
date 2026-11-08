# Domains AGENTS.md

The backend is moving from `src/services/` (factory functions wired in `src/server/routes/index.ts`) to
domain modules under this folder. New capabilities go here; existing services move over one domain at a
time. Background: the Notion pages "Domain Mapping", "NodeJS Folder Structure" and "EE domain".

A domain owns one business capability end to end: its tables, rules, API and tests. Other code reaches
it only through its module.

This file is the reference for building a domain from scratch. Notes specific to one domain go in an
`AGENTS.md` inside that domain.

## Top level

```
src/domains/
├── domains.ts                  # Builds every module in dependency order
├── lib/                        # Shared building blocks with no business logic
├── platform/                   # Domains other products depend on
│   ├── license/
│   └── organizations-projects/
├── secrets-manager/            # A product area
│   └── secrets/                # A domain inside it
├── pam/pam/
├── agent-vault/agent-vault/
└── certificates/cert-manager/
```

Read a domain's own `AGENTS.md` before changing it: [license](platform/license/AGENTS.md),
[organizations-projects](platform/organizations-projects/AGENTS.md), [secrets](secrets-manager/secrets/AGENTS.md),
[pam](pam/pam/AGENTS.md), [agent-vault](agent-vault/agent-vault/AGENTS.md),
[cert-manager](certificates/cert-manager/AGENTS.md). The organizations-projects and cert-manager domains are a
declared exception to "a table belongs to one data access class": they hold only usage counters that read
tables no domain owns yet, tested against Postgres without an in-memory twin.

| Path | Holds |
| --- | --- |
| `domains.ts` | The only wiring file. Builds each module and passes modules and hooks between them |
| `lib/` | Generic helpers: `TransactionRunner`, `TTransaction`, `sealKnexTransaction`, the `TDomainModule` type, and their in-memory versions under `lib/testing/` |
| `platform/` | Domains used by many products: KMS, billing, access control, audit log |
| `<product-area>/` | A product, such as secrets. Holds one or more domains |

## Inside a domain

Every domain has `ce/` (community edition). A domain with paid features also has `ee/` (enterprise
edition) with the same layout. Nothing else sits at the domain root.

```
static-secrets/
├── ce/
│   ├── module.ts     # The edition's public surface: domain interface, hooks, module class
│   ├── model/        # Entities and their rules
│   ├── data-access/  # Database reads and writes, grouped into the domain's store
│   ├── service/      # Use cases, and helpers shared between them
│   ├── router/       # HTTP endpoints
│   └── testing/      # In-memory store, fakes, contract suites
└── ee/               # Same layout as ce/
```

| Path | Holds | Example |
| --- | --- | --- |
| `module.ts` | Public domain interface, hook type, and the module class that builds everything. Other domains import only `ce/module.ts` | `TStaticSecretsDomain`, `TStaticSecretsHooks`, `StaticSecretsModule` |
| `model/` | One class per entity. Validates itself, knows nothing about the database | `KmsKey.create()`, `kmsKey.assertRotatable()` |
| `data-access/` | One class per entity, plus `build<Domain>Store(tx)` that groups them all on one connection | `KmsKeyDataAccess`, `buildKmsCoreStore(tx)` |
| `service/` | One class per use case group, with its input types; plain helper functions shared by those classes. Tests sit beside them | `KmsKeyService`, `createKmsKey(store, ...)` |
| `router/` | Fastify routes. Validate input, call a service, shape the response | `registerKmsKeyRouter` |
| `testing/` | In-memory data access and store, the fake domain for this domain's consumers, data access contract suites | `InMemoryKmsKeyDataAccess`, `FakeKmsCoreDomain` |

## Entities, data access and services

| Piece | Maps to | Rule | Example |
| --- | --- | --- | --- |
| Model | One entity | An entity stored across several tables is still one model | `KmsKey` (tables `kms_keys` and `internal_kms`) |
| Data access | One model | Owns every table that stores the model. Returns models, never rows | `KmsKeyDataAccess`, `KmsKeyVersionDataAccess` |
| Store | One domain | All the domain's data access classes, bound to one connection or transaction | `TKmsCoreStore` |
| Service | A group of use cases | Start with one per entity. Split when a group of use cases needs different dependencies | `KmsKeyService` writes a `KmsKey` and a `KmsKeyVersion` in one transaction |
| Module | One domain | Holds the domain's state, builds its services, exposes `service`, `within(tx)`, `hooks` and `routes` | `KmsCoreModule` |

When one entity holds another:

| Relationship | Model shape | Example |
| --- | --- | --- |
| A few children, always read with the parent | The parent holds them | `Secret` holds its tags |
| Many children, read separately | The child is its own entity and holds the parent's id. The parent has no list | `SecretVersion` holds `secretId`; versions load through `SecretVersionDataAccess.listBySecretId()` |

A table belongs to exactly one data access class. Another domain that needs the data calls that
domain's service.

## Classes

| Piece | Shape | Example |
| --- | --- | --- |
| Model | Private constructor, static `create()` and `restore()` | `KmsKey.create({ ... })` |
| Data access, service | `class X implements TX`, dependencies in `constructor(deps)` | `class KmsKeyService implements TKmsKeyService` |
| Data access queries | Methods on the class; query fragments shared by them are private methods, not `$`-prefixed functions or a factory the class wraps | `private activeCertificates(orgId)` |
| Module | Builds state once, builds services per runner, exposes the public surface | `class KmsCoreModule` |
| Router, shared helpers | Plain functions | `registerKmsKeyRouter`, `createKmsKey(store, state, input)` |

### State and services

A module has two kinds of objects:

| Kind | Examples | Built |
| --- | --- | --- |
| **State**: anything the domain remembers for the life of the process | In-memory root key holder, cache wrappers, HSM or provider clients | Once, in the module constructor |
| **Services**: stateless classes holding only references to state, their runner and their dependencies | `KmsKeyService`, `ScopeKeyService` | Once for `module.service`, and again for every `module.within(tx)` |

- Service constructors only store references. No I/O, no queries, no client creation, no schema
  compilation. Rebuilding a view per transaction is then negligible: a simulation shaped like a real
  module measured about 0.1 µs and about 600 bytes of short-lived heap per view.
- All mutable state lives in a named holder built once in the module constructor. Only the holder
  writes its own state.
- State never touches the database or a transaction. When state must follow a database change, update
  it in `tx.afterCommit(...)`, so a rollback can never leave memory and database disagreeing.

## Transactions

`lib/` provides one mechanism for transactions inside a domain and across domains.

```ts
// lib/transaction-runner.ts
export type TTransaction = { readonly [sealed]: true; afterCommit(fn: () => Promise<void>): void };

export class TransactionRunner<TStore> {
  constructor(db: TDbClient, buildStore: (tx: Knex.Transaction) => TStore, parent?: TTransaction);
  within(tx: TTransaction): TransactionRunner<TStore>;                       // joins tx instead of opening one
  run<T>(work: (ctx: { store: TStore; tx: TTransaction }) => Promise<T>): Promise<T>;
}
```

- `run` opens a transaction, or joins the one the runner was bound to with `within(tx)`, and hands
  the work two things:
  - `store`: this domain's data access, pointed at that transaction;
  - `tx`: the same transaction as a sealed token, to pass to other domains.
- `tx` is not a Knex handle. Nothing outside `data-access/` can run SQL with it; lint bans unsealing it
  anywhere else.
- `tx.afterCommit(fn)` runs `fn` only if the whole transaction commits. Cache invalidation and other
  side effects outside the database go here.

### Inside a domain

```ts
export class KmsCoreModule {
  private readonly state: TKmsCoreState;
  private readonly runner: TransactionRunner<TKmsCoreStore>;
  readonly service: TKmsCoreDomain;

  constructor(deps: TKmsCoreDeps) {
    this.runner = new TransactionRunner(deps.db, buildKmsCoreStore);
    this.state = { rootKey: new RootKeyHolder(), cache: new ProjectKeyCache(deps.keyStore) };
    this.service = this.build(this.runner);
  }

  within(tx: TTransaction): TKmsCoreDomain {
    return this.build(this.runner.within(tx));
  }

  private build(runner: TransactionRunner<TKmsCoreStore>): TKmsCoreDomain {
    const kmsKeys = new KmsKeyService({ runner, state: this.state });
    return { generateKmsKey: (input) => kmsKeys.generateKmsKey(input) };   // arrow wrappers keep `this`
  }
}

export class KmsKeyService implements TKmsKeyService {
  constructor(private readonly deps: { runner: TransactionRunner<TKmsCoreStore>; state: TKmsCoreState }) {}

  generateKmsKey(input: TCreateKmsKeyInput) {
    return this.deps.runner.run(({ store }) => createKmsKey(store, this.deps.state, input));
  }
}

// shared helper: takes the store, never a runner, so it cannot open a transaction
export const createKmsKey = async (store: TKmsCoreStore, state: TKmsCoreState, input: TCreateKmsKeyInput) => {
  const key = KmsKey.create({ ...input, encryptedKeyMaterial: wrapNewKeyMaterial(input, state.rootKey.get()) });
  await store.kmsKeys.create(key);
  return key;
};
```

| Rule | Why |
| --- | --- |
| A public service method calls `this.deps.runner.run(...)` once; only calls to other domains (see below) come before it | One place decides the transaction |
| Work shared between services goes into a helper that takes `store` | A helper cannot open a second transaction by accident |
| Services in the same domain never call each other's public methods | A public method on another service runs its own `run` and is the usual way to open a second connection by mistake |
| Data access never opens a transaction. Writes that span tables (`kms_keys` + `internal_kms`) rely on the caller's | The service owns the boundary |
| Locks exist only on the store handed out by `run` (`store.locks.*`) | A lock outside a transaction does not compile |
| Models never see a store or a transaction | Rules stay pure and testable |

### Across domains

**Domains do not share transactions.** Each domain commits its own data in its own short
transaction, and a use case that spans domains is a sequence of calls that are each safe to repeat. A
shared transaction keeps one domain's row locks held while another domain works, so a write in one
domain can block or deadlock on a lock held by a connection Postgres cannot see waiting, and it ties
together domains that must be able to move independently.

| You need | Do this | Not this |
| --- | --- | --- |
| Something from another domain to write your own data (a cipher, a key id, a plan) | Call the other domain first, then open your `run` for your writes | Calling it inside your `run`, which either joins your transaction or takes a second connection while you hold one |
| Another domain to react to your change (keys for a new project, cleanup after a delete) | Emit an outbox event in your own transaction and let the other domain consume it. Until that event exists, call the other domain after your commit | Calling it inside your transaction, or relying on a foreign-key cascade into its tables |
| Data in two domains that must exist together | Call in dependency order (the domain whose data the other needs goes first), make each write idempotent, and let a sweeper remove orphans | One transaction around both |
| Something created on first use | Create it in the owning domain's own short transaction with `INSERT ... ON CONFLICT DO NOTHING`; the loser rolls back and reads the winner's row | An advisory lock held until a caller's transaction commits |
| To replace a value another request may be changing | Compare and swap: `UPDATE ... WHERE value = :expected`, and treat no row as a conflict | Reading it, then writing it unconditionally |

```ts
export class SecretService implements TSecretService {
  constructor(private readonly deps: { runner: TransactionRunner<TSecretsStore>; kmsCore: TKmsCoreDomain }) {}

  async createSecret(input: TCreateSecretInput) {
    const cipher = await this.deps.kmsCore.createCipherPairWithDataKey({ projectId: input.projectId });
    return this.deps.runner.run(({ store }) =>
      store.secrets.create(Secret.create({ ...input, encryptedValue: cipher.encrypt(input.value) }))
    );
  }
}
```

| Rule | Why |
| --- | --- |
| Call other domains before `run` or after it commits, never inside it | Inside `run` the call either joins your transaction or holds a second connection while yours waits, which exhausts a pool of about 10 |
| Each domain writes only its own tables. Never add a column to another domain's table for your data; keep it in your own table, keyed by the other domain's id | Writing a row another domain updates takes the same row lock its transactions hold, so your write waits on theirs |
| Never hold a lock on a row another domain writes while you call another domain | The other domain may need that row, and the wait cannot be detected as a deadlock |
| Remove your data when the owner tells you it is gone (an event, or a call until the event exists); do not depend on `ON DELETE CASCADE` from another domain's table | A cascade from someone else's table is a write into your tables inside their transaction |
| No network or HSM calls inside a transaction; make them before `run` | The connection and its locks are held for the whole call |
| Within one domain, take locks in one order (root key, org, project; key before data key) | Two transactions taking the same locks in different orders deadlock |
| Legacy code under `src/services/` holding a Knex transaction does not hand it to a domain either: it reads from the domain before opening the transaction, and calls it after the commit. When that code may run inside a caller's transaction, schedule the call with `sealKnexTransaction(trx).afterCommit(...)` from `lib/legacy-transaction.ts` | A domain read on the caller's connection ties the domain's queries to legacy locks; `within(tx)` across domains is a last resort for a migration, never the default |

If an outcome truly has to be atomic across two domains, the boundary is in the wrong place: raise it in
review and move the data into one domain rather than sharing a transaction.

## Dependency direction

```
router → service → data-access → model
              ↘ model
```

| Rule | Why |
| --- | --- |
| A layer imports only layers to its right | Each layer is readable and testable without the ones above it |
| `module.ts` imports from every layer; no layer imports `module.ts` | Avoids cycles. Types a module exposes are defined in the service and re-exported |
| Other domains import only `ce/module.ts` | The module is the domain's contract; everything else can change freely |
| `ce/` never imports `ee/`; only `domains.ts` imports `ee/` from outside the domain | Community code reads and builds alone. EE plugs in through hooks |
| A module that provides hooks is built before the module that takes them | A provider that needs the taker's service is a cycle: move the boundary |
| A platform domain that needs something from the products built on it exposes a registry (`license.registry.registerUsageCounter`). It is built first, and each product registers into it in its own constructor | The platform domain stays a base every product depends on; taking product modules as constructor arguments would make it depend on all of them |
| `ce/module.ts` and what it imports reach `@app/queue`, `@app/keystore/keystore` and `@app/lib/cron/*` only with `import type`; `domains.ts` passes their runtime pieces in | Code all over the backend imports values from a module, and those three sit in an import cycle with `@app/lib/crypto`, which breaks any test that loads them first |
| Lint enforces the import rules above (`.oxlintrc.json`, `no-restricted-imports`) | A broken boundary fails `npm run lint`, not review |

## Where new code goes

Paths are inside `ce/` unless the code is a paid feature.

| You are adding | Put it in |
| --- | --- |
| A business rule about one entity | `model/` |
| A query or table write | `data-access/`, its in-memory version in `testing/`, and a case in the contract suite |
| A use case | `service/` |
| Logic two services need | A helper in `service/` that takes `store` |
| An endpoint | `router/`, registered in `module.ts` |
| Something another domain calls | A method on the domain interface in `module.ts` |
| A step another domain may change | A hook in `module.ts`, with a default |
| Something the domain must remember across requests | A state holder built in the module constructor |
| A paid feature | The same layer, in `ee/` instead of `ce/` |
| A new capability with its own tables | A new domain folder with a `ce/` |

## Naming

| Kind | Pattern | Example |
| --- | --- | --- |
| Folder | kebab-case noun | `static-secrets` |
| Module class | `<Domain>Module`, in `ce/module.ts` | `StaticSecretsModule` |
| Domain interface (what other code calls) | `T<Domain>Domain`. Inside, a domain has many services; outside, it is one domain | `TStaticSecretsDomain` |
| A domain passed as a dependency | `<domain>Domain: T<Domain>Domain`, everywhere it is passed, never a shorter or role name (`license`, `usageMeteringService`). A registry another domain registers into is `<domain>Registry` | `licenseDomain: TLicenseDomain`, `licenseRegistry: TLicenseRegistry` |
| Dependencies of a module or service | `T<Name>Deps`, a named type beside the class, never inline in the constructor | `TKmsCoreDeps`, `TKmsKeyServiceDeps` |
| Hook type | `T<Domain>Hooks` | `TStaticSecretsHooks` |
| Store | `<domain>-store.ts` in `data-access/`, exporting `T<Domain>Store` and `build<Domain>Store` | `kms-core-store.ts` |
| Transaction argument | `tx` (type `TTransaction`) | `run(({ store, tx }) => ...)` |
| EE module | `<Domain>EeModule`, in `ee/module.ts` | `StaticSecretsEeModule` |
| Unit test | `<file>.test.ts`, beside the code | `kms-key-service.test.ts` |
| Integration test | `<file>.integration.spec.ts`, beside the code | `kms-key-data-access.integration.spec.ts` |

## Testing

Tests follow the same rules as the root blackbox suite (`tests/docs/writing-tests.md`), adapted to
Vitest. The unit of a test is **(operation, outcome)**, not line coverage. Write a test because it
claims something a caller depends on, never to raise a coverage number.

### What goes where

| Layer | Tests | Uses |
| --- | --- | --- |
| **Unit** (`*.test.ts`) | Model rules, helpers, service use cases, input matrices | In-memory store and `InMemoryTransactionRunner`; no database, no network |
| **Integration** (`*.integration.spec.ts`) | What only Postgres can prove: SQL, the data access contract, locks, rollback, joining with `within(tx)`, `afterCommit`, concurrency | The real store on a real Postgres, through the integration harness |
| Not here | HTTP status codes and response bodies, effects of queues and crons, the full server | `tests/` (blackbox) and `e2e-test/` |

### Rules for both

- **Outcome, not mechanics.** Assert the state a caller can observe: what is in the store, what the
  service returned, the error it raised. Do not assert that a fake was called with an argument, unless
  that call is the outcome (a provider was asked to encrypt).
- **Name the claim.** `describe("<Class>.<method>")`, then `test("should <outcome> [when <condition>]")`,
  lowercase, outcome first. "handles duplicates" cannot fail; "should keep the first key when two
  callers create one concurrently" can.
- **Three parts.** Every test body is `// Setup`, `// Action`, `// Assert`. About eight lines of setup,
  one action, one to three assertions. Longer setup means a missing helper in `testing/`.
- **Cover failure outcomes:** refused, not found, another org's resource, conflicting, repeated
  (idempotency), concurrent, rolled back.
- **A rejection test also checks that nothing changed.**
- **Assert error messages** where the message is part of the contract (`backend/CODE_QUALITY.md`).
- **Own your data.** Every test creates the orgs, projects and keys it needs, with fresh ids. No test
  depends on rows another test made. Per-test state goes in the test or `beforeEach`, never `beforeAll`.
- **Never sleep.** Await the operation, or poll the state the product records.
- **Fakes reproduce the contract.** One class per file in `testing/`. A fake that only records its input
  proves nothing; an in-memory data access must behave like the real one, which the contract suite
  enforces.
- **Prove it can fail.** Before calling a test done, break the code it covers and confirm the test fails.

### Unit tests

- Build services directly with in-memory state, an `InMemory<Domain>Store` and an
  `InMemoryTransactionRunner`. The in-memory runner behaves like a transaction:
  - it snapshots the store and restores it when the work throws;
  - it runs `afterCommit` hooks only on success;
  - it joins when bound with `within(tx)`;
  - its locks are per-key mutexes released when the work finishes.
- Consumers of a domain use its `Fake<Domain>Domain` from `testing/`, never a hand-rolled mock.

### Integration tests

The harness lives in `lib/testing/integration/`. It gives a test a real, migrated Postgres and any
other server it asks for, with no Fastify server, queues or license server. Files run in parallel.

```bash
npm run test:integration                  # from backend/; needs Docker
npm run test:integration -- kms-key       # one file
make test-api-integration SPEC=kms-key    # the same, from the repo root
```

A test declares what it needs once per `describe` and keeps plain `test(...)`:

```ts
describe("KmsKeyService.generateKmsKey", () => {
  const h = setupIntegration();   // this worker's migrated database, plus tenants

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

| `h.` | Gives |
| --- | --- |
| `db` | Knex on this describe's database (`replicaNode()` and `primaryNode()` resolve to it) |
| `newTenant()` | A new organization, an admin user and one project with dev, staging and prod |
| `factories` | One more row: `user`, `organization`, `orgMembership`, `project`, `projectMembership` |
| `newDatabase()` | An empty database on the same server (a rotation target, say), dropped after the test |

Read `h.*` inside tests and hooks; reading it while the describe is being declared throws. Factories
insert only platform rows no domain owns yet. Create a domain's own rows through its module, so the
test exercises its rules.

How it is shared:

| Level | Postgres | Another server (LDAP, say) |
| --- | --- | --- |
| Once per run | the server, and a template database with every migration applied | the container |
| Once per worker | a clone of the template (`infisical_it_<run>_w<n>`), reused by the worker's later files | nothing |
| Once per test | a tenant from `h.newTenant()` | a namespace such as an OU, from `ldap.newOrgUnit()` |

- **Nothing starts until a test asks for it.** `startOnce(name, start)` (`harness.ts`) lets the first
  caller in the run start a server while every other worker waits on a lock and then reuses its
  address. A run that never asks for a server never starts it.
- **Migrations run once, sequentially.** The template is named after a hash of `src/db/migrations`;
  against a long-lived server (`INTEGRATION_POSTGRES_URL`) an unchanged tree reuses it across runs.
- **Instance-wide state** (root key, server config) is not per tenant. A describe that changes it uses
  `setupIntegration({ freshDatabase: true })`, a private clone dropped afterwards.
- **Postgres** is a Testcontainers container unless `INTEGRATION_POSTGRES_URL` names a server. The
  harness creates and drops only databases named `infisical_it_*` and refuses any other name.
- **Cleanup** is the run's: global teardown removes every container labelled with the run id (the worker
  that started one may exit while others still use it) and drops the run's databases.
- **Never `initDbConnection()` in an integration test.** It registers `primaryNode()`/`replicaNode()`
  globally, once per process; the harness's own client supports several databases in one file.

#### Adding a server

Write one file in `lib/testing/integration/servers/`:

```ts
const startLdapServer = async (): Promise<TLdapServer> => {
  const started = await container("<image>:<exact tag>").withExposedPorts(389).withWaitStrategy(Wait.forListeningPorts()).start();
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

1. `start<Name>()` starts the container with `container(image)` (a Testcontainers builder labelled with
   the run) and returns a plain JSON address: host, port, container id, credentials. It crosses
   processes, so never a live client.
2. `setup<Name>()` calls `startOnce("<name>", start<Name>)` in `beforeAll` and returns `new<Thing>()`,
   which creates a namespace no other test uses (a Unix user, an LDAP OU, a key prefix) and removes it in
   `onTestFinished`.

Nothing else registers it. Add per-test options to `new<Thing>()`, not a second server. Pin the image to
an exact tag, and check it can do what the namespace needs: an sshd running as an unprivileged user, for
instance, can only log in that one user, so it cannot give each test its own.

#### Before you call it done

Run the integration suite three times. A failure that only appears on a rerun is state leaking between
tests or workers.
