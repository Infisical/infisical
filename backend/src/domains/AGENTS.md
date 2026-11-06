# Domains AGENTS.md

The backend is moving from `src/services/` (factory functions wired in `src/server/routes/index.ts`)
to domain modules under this folder. New capabilities go here; existing services move over gradually.
Background: the "Infisical Backend Architecture" and "Domain Mapping" docs.

A domain owns one business capability end to end: its tables, rules, API and tests. Other code
reaches it only through its module.

Keep this file a short reference for the structure and its rules. Domain-specific notes go in an
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
| `domains.ts` | The only wiring file. Builds each module, passes services and hooks between them. |
| `lib/` | Generic helpers such as `TransactionRunner` and the `TDomainModule` type |
| `platform/` | Domains used by many products: KMS, billing, permission, audit log |
| `<product-area>/` | A product, such as secrets. Holds one or more domains. |

## Inside a domain

Every domain has `ce/` (community edition). A domain with paid features also has `ee/` (enterprise
edition) with the same layout. Nothing else sits at the domain root.

```
static-secrets/
├── ce/
│   ├── module.ts     # The edition's public surface: service, hooks
│   ├── model/        # Entities and their rules
│   ├── data-access/  # Database reads and writes
│   ├── service/      # Use cases
│   ├── router/       # HTTP endpoints
│   └── testing/      # Fakes and in-memory data access for tests
└── ee/               # Same layout as ce/
```

| Path | Holds | Example |
| --- | --- | --- |
| `module.ts` | Public service interface, hook type, and the module class that builds everything. Other domains import only `ce/module.ts`. | `TStaticSecretsService`, `TStaticSecretsHooks`, `StaticSecretsModule` |
| `model/` | One class per entity. Validates itself, knows nothing about the database. | `KmsKey.create()`, `kmsKey.assertCanEncrypt()` |
| `data-access/` | One class per entity, plus a builder that creates them all from a db or transaction handle | `KmsKeyDataAccess`, `buildKmsCoreDataAccess(db)` |
| `service/` | One class per use case group, with its input types. Tests sit beside it. | `KmsCryptoService`, `TEncryptWithOrgKeyInput` |
| `router/` | Fastify routes. Validate input, call a service, shape the response. | `registerKmsKeyRouter` |
| `testing/` | In-memory data access and fake services, for this domain's tests and its consumers' tests | `InMemoryKmsKeyDataAccess`, `FakeKmsCoreService` |

## Entities, data access and services

| Piece | Maps to | Rule | Example |
| --- | --- | --- | --- |
| Model | One entity | An entity stored across several tables is still one model | `Secret` (tables `secrets_v2` and `secret_v2_tag_junction`) |
| Data access | One model | Owns every table that stores the model. Returns models, never rows. | `SecretDataAccess`, `SecretVersionDataAccess` |
| Service | A group of use cases | Start with one per entity. Split when a group of use cases needs different dependencies. May use several data access classes. | `SecretService` writes a `Secret` and a `SecretVersion` in one transaction |
| Module | One domain | Builds every data access class and service of the domain | `StaticSecretsModule` |

When one entity holds another:

| Relationship | Model shape | Example |
| --- | --- | --- |
| A few children, always read with the parent | The parent holds them | `Secret` holds its tags |
| Many children, read separately | The child is its own entity and holds the parent's id. The parent has no list. | `SecretVersion` holds `secretId`; `Secret` has no `versions` field, versions load through `SecretVersionDataAccess.listBySecretId()` |

A table belongs to exactly one data access class. Another domain that needs the data calls that
domain's service.

## Classes

Data access classes and services implement an interface defined beside them and take their
dependencies through the constructor.

| Piece | Shape | Example |
| --- | --- | --- |
| Model | Private constructor, static `create()` and `restore()` | `KmsKey.create({ ... })` |
| Data access, service | `class X implements TX`, dependencies in `constructor(deps)` | `class KmsCryptoService implements TKmsCryptoService` |
| Module | Builds the classes and exposes `service`, `hooks` and `routes` | `class KmsCoreModule` |
| Router, small helpers | Plain functions | `registerKmsKeyRouter`, `getOrgKeyOrThrow` |

This maps one to one onto Go (`backend-go/`): a class with an interface is a struct with methods and
an interface, and constructor dependencies are `NewX(deps)`.

## Dependency direction

```
router → service → data-access → model
              ↘ model
```

| Rule | Why |
| --- | --- |
| A layer imports only layers to its right | Each layer is readable and testable without the ones above it |
| `module.ts` imports from every layer; no layer imports `module.ts` | Avoids cycles. Types a module exposes are defined in the service and re-exported. |
| Other domains import only `ce/module.ts` | The module is the domain's contract; everything else can change freely |
| `ce/` never imports `ee/`; only `domains.ts` imports `ee/` from outside the domain | Community code reads and builds alone |

## Where new code goes

Paths are inside `ce/` unless the code is a paid feature.

| You are adding | Put it in |
| --- | --- |
| A business rule about one entity | `model/` |
| A query or table write | `data-access/`, and its in-memory version in `testing/` |
| A use case | `service/` |
| An endpoint | `router/`, registered in `module.ts` |
| Something another domain calls | A method on the service interface in `module.ts` |
| A step another domain may change | A hook in `module.ts`, with a default |
| A paid feature | The same layer, in `ee/` instead of `ce/` |
| A new capability with its own tables | A new domain folder with a `ce/` |

## Naming

| Kind | Pattern | Example |
| --- | --- | --- |
| Folder | kebab-case noun | `static-secrets` |
| Module class | `<Domain>Module`, in `ce/module.ts` | `StaticSecretsModule` |
| Service interface | `T<Domain>Service` | `TStaticSecretsService` |
| Hook type | `T<Domain>Hooks` | `TStaticSecretsHooks` |
| Data access group | `<domain>-data-access.ts` exporting `T<Domain>DataAccess` and `build<Domain>DataAccess` | `static-secrets-data-access.ts` |
| EE module | `<Domain>EeModule`, in `ee/module.ts` | `StaticSecretsEeModule` |
