# Instance Config Core domain

The instance's configuration: the single `super_admin` row (settings, the Slack and Teams app credentials, env
overrides), cached for every pod, and the env overrides applied to this process's env holder. Owns `super_admin`.
Depends only on KMS Core, for the root key that encrypts credentials and env overrides. Instance Admin
(`src/services/super-admin/`) keeps the admin console, the login-method lockout guard and the Teams bot re-init, and
saves through `updateConfig`.

| Layer | Holds |
| --- | --- |
| `ce/model/` | `InstanceConfig` (the row; `toView()` drops every `encrypted*` column), `InstanceConfigChange` (the columns one update writes, never empty), `IntegrationCredentials` |
| `ce/data-access/` | `InstanceConfigDataAccess` (`super_admin`), the frozen init lock, `ServerConfigCache` (the shared Redis entry) |
| `ce/service/` | `InstanceConfigService` (create, read, update), `IntegrationCredentialsService` (decrypted app credentials), `EnvOverridesService`; `TInstanceConfigEnv`, the port to `lib/config/env.ts` |

## Rules

- **Read config through the domain.** `getServerConfig()` returns the settings without credentials;
  `getAdminIdentityIds()`, `getSlackCredentials()` (stored, else `WORKFLOW_SLACK_CLIENT_ID`/`SECRET` from env) and
  `getMicrosoftTeamsCredentials()` return what their names say. Never read `super_admin` or decrypt its columns
  anywhere else.
- **The cache key, TTL and value are frozen** (`server-config-cache.ts`): `infisical-admin-cfg`, 60 seconds, the full
  joined row with ciphertext as Buffer JSON. Pods of the previous release share the entry during a rolling deploy and
  their Slack code decrypts from it, so caching a narrower value under that key breaks them.
- **Cross-pod model.** An update rewrites the shared cache entry after commit, so every pod reads the change on its
  next `getServerConfig()`. Decrypted credentials are held per process and decrypted again when the cached row's
  `updatedAt` changes. Env overrides live in each process's env holder and reach other pods within the five-minute
  refresh that `start()` registers. Teams runs its own five-minute sync, keyed on `updatedAt`, to rebuild its bot.
- **Encrypt before the transaction.** `updateConfig` encrypts with the root key, then writes, then in `afterCommit`
  rewrites the cache, refreshes the held credentials and applies new env overrides to this process.
- **Boot order.** `initialize()` creates the row and clears the cache; it never decrypts, because it runs before
  KMS Core starts. `start()` decrypts, so it runs after `kmsCore.start()`.
- **Boot FIPS read.** `InstanceConfigCoreModule.readFipsSetting(knex)` is a plain read that `main.ts`,
  `getMigrationEnvConfig`, the seeds and the e2e environment call before migrations: `null` when the table or the row is
  missing (a new instance), otherwise `fipsEnabled`. Any other error is thrown, so a database failure at boot can never
  be mistaken for a new FIPS deployment. `crypto.initialize` and `initEnvConfig` take the result; neither touches the
  database.
- **Create the row with `INSERT ... ON CONFLICT (id) DO NOTHING`, then read it** (`createIfMissing`). Concurrent
  boots each get the one row; read-then-insert would fail all but one of them on the primary key.
- **Keep `ce/module.ts` cheap to import.** `main.ts` imports it before anything else boots. `lib/config/env.ts` reaches
  the domain only as `TInstanceConfigEnv`, built in `domains.ts`; `@app/lib/cron/*` and the key store come in through
  deps.

## Env config and instance config

There is one owner and two read paths. `lib/config/env.ts` stays the parser and the synchronous holder of the effective
env (process env plus the stored overrides), because it is needed before the database exists, by migrations and by
`lib/` code. This domain is the only code that stores overrides or applies them (`overrideEnvConfig`).

- Overridable keys are read through `getConfig()` from `lib/config/env.ts` like any env value. Code that captures them
  once at boot never sees an override: the GitHub Radar app (`server/plugins/secret-scanner-v2.ts`). SSO strategies
  (`server/routes/v1/sso-router.ts`) re-register on their own five-minute timer, so an override can take up to about ten
  minutes to reach them.
- Direction for later: the overridable credential keys move out of the env holder into typed getters here, with env as
  the fallback, the way `getSlackCredentials()` works.

## Declared exceptions

- `InstanceConfigDataAccess.findById` joins `organizations`, `saml_configs` and `oidc_configs` for the default auth org
  (`defaultAuthOrgSlug`, `defaultAuthOrgAuthEnforced`, `defaultAuthOrgAuthMethod`), until Organizations & Projects and
  User Accounts expose that data.
- The `encryptedGitHubAppConnection*` columns are written by `PATCH /api/v1/admin/config` and returned by
  `GET /api/v1/admin/integrations`, but nothing else reads them: migration `20250711005900` moved those credentials to
  env overrides. Left in place for a later cleanup with a schema change.

## Tests

`ce/testing/build-instance-config-core.ts` builds the module over `InMemoryInstanceConfigCoreDataAccess`,
`InMemoryKeyStore`, `FakeInstanceConfigEnv` and `TestRootKeyCipher`; pass another build's `inMemory` and `keyStore` to
get a second pod. Consumers use `FakeInstanceConfigCoreDomain`, constructed with the settings the test needs.
`instance-config-data-access-contract.ts` runs against both data access classes. Integration specs use
`setupIntegration({ freshDatabase: true })`, since `super_admin` is one row for the instance.
