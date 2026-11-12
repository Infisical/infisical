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
│   └── organizations-projects/
├── secrets-manager/secrets/    # <product-area>/<domain>
├── pam/pam/
├── agent-vault/agent-vault/
└── certificates/cert-manager/
```

Read a domain's `AGENTS.md` before changing it: [license](platform/license/AGENTS.md),
[organizations-projects](platform/organizations-projects/AGENTS.md), [secrets](secrets-manager/secrets/AGENTS.md),
[pam](pam/pam/AGENTS.md), [agent-vault](agent-vault/agent-vault/AGENTS.md),
[cert-manager](certificates/cert-manager/AGENTS.md).

`lib/` has `TransactionRunner`, `TTransaction`, `sealKnexTransaction` (`legacy-transaction.ts`), the domain
errors (`errors.ts`) and in-memory versions under `lib/testing/`.

A domain has `ce/`, `ee/`, or both, with the same layout inside. Nothing else at the root. Code moving from
`src/ee/**` goes to the domain's `ee/`, and a domain may be `ee/` only: everything under an `ee/` path is
EE-licensed, so moving it into `ce/` relicenses it as MIT. That is a maintainer's call, never part of a refactor.

| Path | Holds |
| --- | --- |
| `module.ts` | The module class that builds everything, plus re-exports of the types other code uses. Other domains import only `ce/module.ts`, so a `ce/` domain never depends on an `ee/`-only one |
| `models/` | One class per entity or value, with its rules. A file holds the class and its props type, nothing else (no request types, key/queue names, helpers). Knows nothing about the DB |
| `data-access/` | One class per entity implementing a type from `services/dependencies.ts` and returning models, plus `data-access/<domain>-store.ts` exporting `build<Domain>Store(trx, locks)` |
| `clients/<system>/` | Client for an external system, one folder per system. Speaks domain terms at its boundary: builds the request and maps statuses into outcomes, so services never match on status codes. A paid system's client lives in `ee/` and implements a `ce/` type; `ce/` never holds a stand-in |
| `services/` | Business logic. One folder per use case group: `services/<name>/service.ts` holds the class (`T<Name>Service`) and its input types, with its unit and integration tests and the helpers only it uses beside it. Helpers two or more services use go in `services/helpers/`. `services/dependencies.ts` holds the data access and store types, `T<Domain>Store` included, and what the services need from EE or a domain they can't import |
| `router/` | Fastify routes: validate, call a service, shape the response |
| `testing/` | In-memory data access and store, a `Fake<Name>Service` per service another domain or legacy code calls, contract suites |

## Building blocks

| Piece | Rule |
| --- | --- |
| Model | One per entity, even if stored across several tables. Private constructor, static `create()`/`restore()`, `toJSON()`. Props stay private: expose behavior, plus getters for the fields callers need, so nobody reads a raw field the model has a rule for (`plan.has(PlanFeature.Rbac)`, not `plan.rbac`) or mutates it. Never a bare type or function |
| Entity | Has an id and changes over time. `create()` validates, generates the id and throws `RuleViolationError` for bad input; `restore()` trusts the row. Changes go through intention-revealing methods that enforce the rules and mutate the private props (`trustedIp.changeAddress(...)`, `membership.deactivate()`), never a generic `update(props)` or a setter; data access then persists the instance |
| Value object | No id, compared by value, immutable (`Plan` is deep-frozen, `Meter` and `SeatUsage` are readonly). A change returns a new instance. Use one for any value with rules attached: a quota, a key, a scope |
| Data access | One per model. Owns every table storing that model, returns models not rows. A table belongs to exactly one data access class; other domains go through the owner's service. Shared query fragments are private methods |
| Store | All of a domain's data access, bound to one connection or transaction |
| Service | Start with one per entity; split when use cases need different deps or callers use one group without the other (`LicenseService` vs `UsageMeteringService`). `class X implements TX`, `TX` is a `type` using method syntax, not arrow props |
| Module | Only `new` calls. Builds everything once and exposes services as-is (typed by their service type). Never wraps a service method |
| Router | `register<Name>Router(server)` in `router/`, registered where the legacy router was (`ee/routes/v<N>/index.ts` or `server/routes/v<N>/index.ts`) under the same prefix. It reads its service from `server.services.<name>Service`, which `routes/index.ts` decorates with `domains.<domain>.<name>Service`.
| Helpers | Plain functions |

Children: if there are a few and they're always read with the parent, the parent holds them (`Secret` holds
its tags). If there are many and they're read separately, the child is its own entity holding the parent id
(`SecretVersion.secretId`).

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

## Transactions

```ts
export class TransactionRunner<TStore> {
  constructor(db: TDbClient, buildStore: (trx: Knex, locks: TStoreLocks) => TStore, parent?: TTransaction);
  within(tx: TTransaction): TransactionRunner<TStore>; // joins tx instead of opening one
  run<T>(work: (ctx: { store: TStore; tx: TTransaction }) => Promise<T>): Promise<T>;
}
```

The KMS code in this file is a sketch of the shape, not code in the repo; see "Reference code" for real examples.

`run` opens a transaction (or joins the `within(tx)` one) and hands you `store` bound to it and `tx`, a
sealed token for `afterCommit` and for joining another runner in the same domain. `tx` isn't a Knex handle;
lint keeps `unsealTransaction` inside `data-access/`. `tx` never goes to another domain.

```ts
export class KmsKeyService implements TKmsKeyService {
  constructor(private readonly deps: { runner: TransactionRunner<TKmsCoreStore>; state: TKmsCoreState }) {}

  generateKmsKey(input: TCreateKmsKeyInput) {
    return this.deps.runner.run(({ store }) => createKmsKey(store, this.deps.state, input));
  }
}

// takes the store, never a runner, so it can't open a transaction
export const createKmsKey = async (store: TKmsCoreStore, state: TKmsCoreState, input: TCreateKmsKeyInput) => {
  const key = KmsKey.create({ ...input, encryptedKeyMaterial: wrapNewKeyMaterial(input, state.rootKey.get()) });
  await store.kmsKeys.create(key);
  return key;
};
```

Inside a domain:

- A public service method calls `runner.run(...)` once. That's the one place deciding the transaction.
- Never call a public service method (any domain) inside `run`: it opens its own `run` and grabs a second
  connection while you hold the first. Share work through helpers that take `store`. Outside `run`, services
  in the same domain can call each other.
- Data access never opens a transaction; multi-table writes rely on the caller's.
- Locks only exist on the store from `run` (`store.locks.*`), so a lock outside a transaction doesn't compile.
- Take locks in one order (root key, org, project; key before data key) or you deadlock.
- Models never see a store or transaction.

### Across domains

Calling another domain is a last resort. Before adding one:

1. If you keep needing another domain's data for your own decisions, the boundary is wrong. Move the data
   or rule and raise it in review.
2. If the other domain should react to your change (keys for a new project, cleanup after a delete), emit an
   outbox event in your transaction. Until that event exists, call it after your commit.
3. If you need a value to write your own data (a cipher, a key id, a plan), call it before your `run`.

Domains don't share a transaction by default. A shared one keeps one domain's row locks held while another
works, and with a pool of ~10 connections you get deadlocks Postgres can't see. A cross-domain use case is a
sequence of short, repeatable calls; the one exception is in "Sharing a transaction" below.

```ts
async createSecret(input: TCreateSecretInput) {
  const cipher = await this.deps.kmsKeyService.createCipherPairWithDataKey({ projectId: input.projectId });
  return this.deps.runner.run(({ store }) =>
    store.secrets.create(Secret.create({ ...input, encryptedValue: cipher.encrypt(input.value) }))
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
- Each method takes its lock with `store.locks.acquire` and reads through the store, so the count runs on the
  caller's connection (the primary) and sees the caller's uncommitted rows.
- Legacy code passes `sealKnexTransaction(trx)`. It refuses `afterCommit`, since on a nested Knex
  transaction the only commit it can see is a savepoint release; the caller runs follow-ups after its commit.
- Read everything else (the plan, anything from the License Server) before opening the transaction.
- Every writer of a limit takes the same domain lock. Domain locks hash with `hashtextextended`, legacy
  `PgSqlLock` with a JS hash, so the same name in both is two different locks.
- Prove it with an integration test that runs concurrent writers at limit minus one and fails without the lock.

If something truly has to be atomic across two domains, the boundary is wrong. Move the data into one domain.

## Errors

A domain throws only the kinds in `lib/errors.ts`, never `BadRequestError` and the rest of `@app/lib/errors`: domains
also run from queues and crons, where a status code means nothing. `toHttpError` (`server/lib/domain-errors.ts`)
maps them at the HTTP boundary.

| Kind | Throw when | HTTP |
| --- | --- | --- |
| `RuleViolationError` | The caller asked for something the rules refuse: bad input, a limit reached, a feature not on the plan, a conflict | 400 |
| `EntityNotFoundError` | The thing doesn't exist, or belongs to another org or project (same answer, so another tenant's ids don't reveal they exist) | 404 |
| `ExternalSystemError` | Something the domain depends on failed (the License Server, a cloud API); nothing the caller sent is wrong | 500 |

Who throws:

- The model throws `RuleViolationError` for its own rules (`create()`, change methods, `plan.assert`,
  `seatUsage.assertAvailable`). Services don't re-check what the model guarantees.
- Data access never throws for a missing row: `find*` returns `null`, and the service turns it into
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
`data-access/` and clients implement those, and `module.ts` wires them. This is what lets services run on the
in-memory store and lets EE plug in without `ce/` importing it.

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
  `@app/lib/crypto` and break any test that loads them first.
- No HTTP error classes from `@app/lib/errors` in a domain; see Errors.
- A domain never takes a legacy service or DAL (`src/services/**`, `src/ee/services/**`), and legacy code never
  feeds one in. If a module needs one, migrate that dependency first. That includes authorization: a module that
  checks permissions waits for the permissions domain; don't wrap `permissionService` in an adapter or add a second
  construction phase to get at it. Pure helpers from `@app/lib` (`@app/lib/ip`, the crypto primitives) are fine;
  `@app/lib/request-context` is not, since domains also run from queues and crons.
- A domain may read a table no domain owns yet only as a declared exception in its `AGENTS.md`, like
  `organizations-projects`. Prefer adding the read there over a second domain reading the same table.
- Lint (`.oxlintrc.json`, `no-restricted-imports`) enforces all this: one override per layer folder (`models/`,
  `services/`, `data-access/`, `clients/`, `router/`), each repeating the shared patterns because the last matching
  override wins. A new layer folder needs its own override. Test files are exempt from layer order. Imports of
  legacy `@app/ee/**` from `ce/` aren't linted, catch them in review.

## Where new code goes

Inside `ce/` unless it's a paid feature or comes from `src/ee/**` (then the same layer in `ee/`).

| Adding | Goes in |
| --- | --- |
| A rule about one entity | `models/` |
| A query or write | `data-access/`, plus its in-memory version in `testing/` and a contract suite case |
| A use case | `services/` |
| Logic two services share | A helper in `services/helpers/` that takes `store` |
| An endpoint | `router/`, registered beside the legacy routers (see Router above) |
| Something other domains call | A method on the service type, re-exported from `module.ts` |
| Something from data access, EE, or a domain that depends on you | A type in `services/dependencies.ts`, passed through the constructor. Anything else from another domain: take its whole service type |
| Cross-request memory | A state holder built in the module constructor |
| A capability with its own tables | A new domain folder with `ce/`, or `ee/` if its code is EE |

## Reference code

Copy these before inventing a shape. Pieces marked "none yet" have no example: the first domain to need one
sets the pattern from the rules above, and its PR names it here.

| Piece | Copy |
| --- | --- |
| Value object with rules | `platform/license/ce/models/plan.ts` (`has`/`assert`/`limit`/`exceeds`), `seat-usage.ts`, `meter.ts` |
| Entity, store, in-memory store, contract suite, router | none yet |
| Query style on Postgres (returns counts, so no row-to-model mapping) | `platform/organizations-projects/ce/data-access/organization-data-access.ts` |
| Joining a caller's transaction | `platform/organizations-projects/ce/services/organizations-projects/organizations-projects-transaction.ts` |
| Module with async setup, workers and crons | `platform/license/ce/module.ts` |
| EE implementing a `ce/` type, external client | `platform/license/ee/` |
| Fake for consumers | `platform/license/ce/testing/fake-license-service.ts` |
| A product handing a platform domain its implementation | `secrets-manager/secrets/ce/module.ts` (`usageCounters`) |
| Legacy code calling a domain | any `licenseService: TLicenseService` in `src/services/**` |

## Migrating a legacy module

1. Check its dependencies. Every legacy service or DAL it calls must already be a domain, or be one this module
   will own (see Dependency direction). Otherwise migrate that first, or stop.
2. Place it: `<product-area>/<domain>/`, or `platform/` if other domains depend on it, named for the capability.
   Code from `src/ee/**` goes to `ee/`.
3. Keep the contract: URLs, methods, status codes, response shapes, error messages, audit event types and
   metadata, queue and key names (old pods share them during a rolling deploy), and table names (migrations stay
   in `src/db/migrations`, row types in `@app/db/schemas`). Any change, including a 500 becoming a 404, is listed in
   the PR for the author to accept (`backend/CODE_QUALITY.md`), never made silently.
4. Move rules out of the service into the model, queries into data access, and `BadRequestError` /
   `NotFoundError` into domain errors. A plan check reads the plan before `run` and refuses with
   `plan.assert(PlanFeature.X)`; never gate a read or a delete.
5. Wire it: build the module in `domains.ts`, hand its services to legacy callers from `domains.<domain>` in
   `routes/index.ts`, and replace the legacy factory everywhere. Delete the old service, DAL and types. Point the
   `server.services` entry and its `@types/fastify.d.ts` type at the domain service (`<name>Service`).
6. Test it: model and service unit tests on the in-memory store, the data access contract suite, integration
   specs for SQL and locks, a `Fake<Name>Service` if anything else calls it, and a blackbox plan in `tests/` for
   every API change.
7. Add the domain's `AGENTS.md` (what it owns, declared exceptions) and link it from the list at the top of this file.

## Naming

| Kind | Pattern | Example |
| --- | --- | --- |
| Folder | kebab-case noun | `static-secrets` |
| Module | `<Domain>Module` in `ce/module.ts`, `<Domain>EeModule` in `ee/module.ts` | `StaticSecretsModule` |
| Service | `class <Name>Service implements T<Name>Service` | `LicenseService` |
| Service as a dep | Always `<name>Service: T<Name>Service`, whole type, never a `Pick<>` or a short name like `license` | `licenseService: TLicenseService` |
| Deps type | `T<Name>Deps`, named, beside the class, never inline | `TKmsCoreDeps` |
| Dependency type | Named for what the service needs | `TPlanCache`, `TUsageCounter` |
| Store | `T<Domain>Store` in `services/dependencies.ts` (the service's runner needs it, and `services/` can't import `data-access/`); `build<Domain>Store` in `data-access/<domain>-store.ts` | `kms-core-store.ts` |
| Transaction arg | `tx: TTransaction` | |
| Service file | `services/<name>/service.ts`; the folder carries the name | `license/service.ts` |
| Tests | `<file>.test.ts` (unit), `<file>.integration-test.ts` (integration), beside the code | `service.test.ts` |

## Testing

Same philosophy as the blackbox suite (`tests/docs/writing-tests.md`): test (operation, outcome) pairs a
caller depends on, not line coverage.

| Layer | Tests | Uses |
| --- | --- | --- |
| Unit (`*.test.ts`) | Model rules, helpers, service use cases, input matrices | In-memory store and `InMemoryTransactionRunner`, no DB or network |
| Integration (`*.integration-test.ts`) | Things only Postgres proves: SQL, data access contract, locks, rollback, `within(tx)`, `afterCommit`, concurrency | Real store on real Postgres via the harness |
| Not here | HTTP responses, queue/cron effects, the full server | `tests/` and `e2e-test/` |

Rules:

- Assert observable outcomes (store contents, return values, errors), not that a fake got called, unless the
  call is the outcome.
- `describe("<Class>.<method>")` + `test("should <outcome> [when <condition>]")`, lowercase.
- Body is `// Setup`, `// Action`, `// Assert`. Roughly eight setup lines, one action, one to three asserts.
  Long setup means a missing helper in `testing/`.
- Cover failures (refused, not found, other org's resource, conflict, repeat, concurrent, rollback). A
  rejection test also checks nothing changed. Assert messages when they're part of the contract.
- Each test makes its own data with fresh ids. Per-test state in the test or `beforeEach`, never `beforeAll`.
- Never sleep.
- Fakes must behave like the real thing, one class per file in `testing/`. The contract suite enforces it for
  in-memory data access: `testing/<entity>-data-access-contract.ts` exports
  `describe<Entity>DataAccessContract(name, setup)`, run by a unit test against the in-memory class and by an
  integration test against Postgres, so both pass the same cases.
- Break the code and watch the test fail before calling it done.

### Unit tests

Build services directly with in-memory state, an `InMemory<Domain>Store` and `InMemoryTransactionRunner`.
The runner acts like a real transaction: restores the store snapshot on throw, runs `afterCommit` only on
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

| `h.` | Gives |
| --- | --- |
| `db` | Knex on this describe's DB (`primaryNode()`/`replicaNode()` resolve to it) |
| `newTenant()` | New org, admin user, one project with dev/staging/prod |
| `factories` | Single rows: `user`, `organization`, `orgMembership`, `project`, `projectMembership` |
| `newDatabase()` | Empty DB on the same server, dropped after the test |

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

- `start<Name>()` returns a plain JSON address (host, port, container id, creds), never a live client, since it
  crosses processes.
- `new<Thing>()` makes a namespace no other test uses and removes it in `onTestFinished`. Put per-test options
  here, not in a second server.
- Pin an exact image tag and check it can actually do per-test namespaces (an sshd running unprivileged can only
  log in one user, for example).

Run the suite three times before calling it done. Failures that only show on reruns mean state is leaking.
