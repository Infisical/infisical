# Instance Config Core domain

The instance's configuration: the single `super_admin` row (settings, the Slack, Teams and GitHub app credentials, the
env overrides) shared by every pod through Redis, and every env value an instance admin can override, resolved. Owns
`super_admin`. Depends only on KMS Core, for the root key that encrypts credentials and overrides. Instance Admin
(`src/services/super-admin/`) keeps the admin console, the login-method lockout guard and the Teams bot re-init.

| Piece | Holds |
| --- | --- |
| `models/instance-config.ts` | `InstanceConfig`, the row: intent methods (`changeSignUpPolicy`, `completeSetup`, `revokeAdminIdentity`, `changeSlackCredentials`, `replaceEnvOverrides`, ...), `toSettings()` (an allowlist) and the decrypting reads, each given the root key's `encrypt` / `decrypt` |
| `models/*-credentials.ts` | Value objects for decrypted credentials |
| `models/env-overrides.ts` | `EnvOverrides`: the overridable keys, their groups and schema, and `resolve(processEnv)`, the stored overrides on top of the process env |
| `data-access/instance-config-store.ts` | `super_admin`, with the default auth org joined in; static `readFipsSetting` / `readInitialized` for boot |
| `data-access/instance-config-cache.ts` | The shared Redis copy (frozen, see below) |
| `data-access/resolved-env-cache.ts` | This process's resolution of the overridable env, keyed by the stored overrides |
| `services/instance-config/service.ts` | `InstanceConfigService`, orchestration only |

## Rules

- **One origin for overridable env values.** The keys an instance admin can override (`EnvOverrides.KEYS`, plus the
  derived `isGithubRadarConfigured`) are not in `lib/config/env.ts` at all: `EnvOverrides` parses them from the process
  env, `domains.ts` passes a boot snapshot of `process.env` in as `processEnv`, and `getInstanceConfig()` returns them
  with the settings, resolved once per stored overrides. A new overridable key is added to `OVERRIDE_GROUPS` and the
  schema in `models/env-overrides.ts`, never to `envSchema`; the shared Azure app, the legacy Heroku app and
  `URL_GITLAB_LOGIN` are parsed there too because only these keys fall back to them.
- **Read per use and destructure.** `getInstanceConfig()` holds plaintext secrets: never spread it into a response, log
  it or pass the whole object on. Routes that return settings list their fields (`GET /api/v1/admin/config`).
- **Bad overrides never break reads.** Stored overrides that cannot be decrypted, parsed or accepted by the schema are
  logged and the process env is used instead, as applying them always did.
- **The cache key, TTL and value are frozen** (`instance-config-cache.ts`): `infisical-admin-cfg`, 60 seconds, the full
  row with ciphertext as Buffer JSON. Pods of the previous release share the entry and their Slack code decrypts from
  it, so caching a narrower value under that key breaks them. A new `super_admin` column fails to compile until
  it is listed in `InstanceConfig.toJSON()`, in `InstanceConfigStore.save()`, and, for a ciphertext column, in
  `InstanceConfigCache.get()`.
- **Writes lock the row.** Every change runs `findForUpdate()`, the intent methods and `save()` in one transaction, then
  rewrites the shared copy after commit, so every pod reads it within a minute. A caller acting on its own change
  reads `{ readFrom: ReadFrom.Primary }` (the Teams bot re-init does).
- **The module creates the row.** `InstanceConfigCoreModule.create` runs `INSERT ... ON CONFLICT (id) DO NOTHING`, so
  any number of pods booting at once leave one row, and drops the shared copy a previous deploy left. A replica that
  has not caught up with the row reads the primary.
- **Boot FIPS read.** `crypto.initialize` and `initEnvConfig` take a loader,
  `() => InstanceConfigCoreModule.readFipsSetting(knex)`, called only when `FIPS_ENABLED=true`. It returns `null` when
  the table or the row is missing; any other error is thrown, so a database failure is never taken for a new FIPS
  deployment.

## Declared exceptions

- The store joins `organizations`, `saml_configs` and `oidc_configs` for the default auth org (`defaultAuthOrgSlug`,
  `defaultAuthOrgAuthEnforced`, `defaultAuthOrgAuthMethod`), read-only, until Organizations & Projects and User
  Accounts expose that data.

## Tests

Consumers use `FakeInstanceConfigService` (`testing/fake-instance-config-service.ts`): the real service over one
in-memory row, constructed with the `settings`, overridable `env` values and credentials a test needs.
`buildInstanceConfigCore()` builds the module over in-memory stores, `InMemoryKeyStore` and `FakeKmsCore`, with a plain
`processEnv` object; pass another build's `memory`, `keyStore` and `kmsCore` for a second pod.
`testing/instance-config-store-contract.ts` runs against both stores. Integration tests use `setupIntegration({ freshDatabase: true })`, since `super_admin` is one
row for the instance.
