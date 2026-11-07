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
├── domains.ts            # Builds every module in dependency order
├── lib/                  # Shared building blocks with no business logic
├── platform/             # Domains other products depend on
│   ├── billing-core/
│   └── kms-core/
└── secrets/              # A product area
    └── static-secrets/   # A domain inside it
```

| Path | Holds |
| --- | --- |
| `domains.ts` | The only wiring file. Builds each module and passes modules and hooks between them |
| `lib/` | Generic helpers: `TransactionRunner`, `TTransaction`, the `TDomainModule` type, and their in-memory versions under `lib/testing/` |
| `platform/` | Domains used by many products: KMS, billing, access control, audit log |
| `<product-area>/` | A product, such as secrets. Holds one or more domains |

## Inside a domain

Every domain has `ce/` (community edition). A domain with paid features also has `ee/` (enterprise
edition) with the same layout. Nothing else sits at the domain root.

```
static-secrets/
├── ce/
│   ├── module.ts     # The edition's public surface: service interface, hooks, module class
│   ├── model/        # Entities and their rules
│   ├── data-access/  # Database reads and writes, grouped into the domain's store
│   ├── service/      # Use cases, and helpers shared between them
│   ├── router/       # HTTP endpoints
│   └── testing/      # In-memory store, fakes, contract suites
└── ee/               # Same layout as ce/
```

| Path | Holds | Example |
| --- | --- | --- |
| `module.ts` | Public service interface, hook type, and the module class that builds everything. Other domains import only `ce/module.ts` | `TStaticSecretsService`, `TStaticSecretsHooks`, `StaticSecretsModule` |
| `model/` | One class per entity. Validates itself, knows nothing about the database | `KmsKey.create()`, `kmsKey.assertRotatable()` |
| `data-access/` | One class per entity, plus `build<Domain>Store(tx)` that groups them all on one connection | `KmsKeyDataAccess`, `buildKmsCoreStore(tx)` |
| `service/` | One class per use case group, with its input types; plain helper functions shared by those classes. Tests sit beside them | `KmsKeyService`, `createKmsKey(store, ...)` |
| `router/` | Fastify routes. Validate input, call a service, shape the response | `registerKmsKeyRouter` |
| `testing/` | In-memory data access and store, fake services for this domain's consumers, data access contract suites | `InMemoryKmsKeyDataAccess`, `FakeKmsCoreService` |

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
  readonly service: TKmsCoreService;

  constructor(deps: TKmsCoreDeps) {
    this.runner = new TransactionRunner(deps.db, buildKmsCoreStore);
    this.state = { rootKey: new RootKeyHolder(), cache: new ProjectKeyCache(deps.keyStore) };
    this.service = this.build(this.runner);
  }

  within(tx: TTransaction): TKmsCoreService {
    return this.build(this.runner.within(tx));
  }

  private build(runner: TransactionRunner<TKmsCoreStore>): TKmsCoreService {
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
| A public service method calls `this.deps.runner.run(...)` once, at the top | One place decides the transaction |
| Work shared between services goes into a helper that takes `store` | A helper cannot open a second transaction by accident |
| Services in the same domain never call each other's public methods | A public method on another service runs its own `run` and is the usual way to open a second connection by mistake |
| Data access never opens a transaction. Writes that span tables (`kms_keys` + `internal_kms`) rely on the caller's | The service owns the boundary |
| Locks exist only on the store handed out by `run` (`store.locks.*`) | A lock outside a transaction does not compile |
| Models never see a store or a transaction | Rules stay pure and testable |

### Across domains

The default is **no shared transaction**. Each domain commits its own data. Cross-domain consistency
comes from call order (the domain whose data the other needs goes first), idempotent writes
(`INSERT ... ON CONFLICT`), outbox events for follow-ups, and sweepers for orphans.

Share a transaction across domains only when the outcome must be atomic, and keep it rare. Then pass
`tx` and call the other domain through `within(tx)`:

```ts
export class SecretService implements TSecretService {
  constructor(private readonly deps: { runner: TransactionRunner<TSecretsStore>; kmsCore: { within(tx: TTransaction): TKmsCoreService } }) {}

  createSecret(input: TCreateSecretInput) {
    return this.deps.runner.run(async ({ store, tx }) => {
      const cipher = await this.deps.kmsCore.within(tx).createCipherPairWithDataKey({ projectId: input.projectId });
      await store.secrets.create(Secret.create({ ...input, encryptedValue: cipher.encrypt(input.value) }));
    });
  }
}

// a use case spanning domains uses a runner with no store and only passes tx
await new TransactionRunner(db, () => undefined).run(async ({ tx }) => {
  const project = await orgsProjects.within(tx).createProject({ orgId, name });
  await secrets.within(tx).createSecret({ projectId: project.id, key, value });
});
```

| Rule | Why |
| --- | --- |
| Each domain writes only its own tables, even inside a shared transaction | Sharing a connection does not share ownership |
| Only the outermost caller opens the transaction; everything inside joins | No nesting, no savepoints, one commit |
| No network or HSM calls inside a transaction; make them before `run` | The connection and its locks are held for the whole call |
| Keep shared transactions short; take locks in one global order (root key, org, project; key before data key) | Locks are held until the outermost commit |
| A domain never keeps `tx` after its call returns | No use after commit |

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

## Where new code goes

Paths are inside `ce/` unless the code is a paid feature.

| You are adding | Put it in |
| --- | --- |
| A business rule about one entity | `model/` |
| A query or table write | `data-access/`, its in-memory version in `testing/`, and a case in the contract suite |
| A use case | `service/` |
| Logic two services need | A helper in `service/` that takes `store` |
| An endpoint | `router/`, registered in `module.ts` |
| Something another domain calls | A method on the service interface in `module.ts` |
| A step another domain may change | A hook in `module.ts`, with a default |
| Something the domain must remember across requests | A state holder built in the module constructor |
| A paid feature | The same layer, in `ee/` instead of `ce/` |
| A new capability with its own tables | A new domain folder with a `ce/` |

## Naming

| Kind | Pattern | Example |
| --- | --- | --- |
| Folder | kebab-case noun | `static-secrets` |
| Module class | `<Domain>Module`, in `ce/module.ts` | `StaticSecretsModule` |
| Service interface | `T<Domain>Service` | `TStaticSecretsService` |
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
  - its locks are per-key mutexes released when the work finishes;
  - it fails the test if a second top-level `run` opens while one is active in the same call chain
    (the "forgot to pass `tx`" mistake).
- Consumers of a domain use its `Fake<Domain>Service` from `testing/`, never a hand-rolled mock.
