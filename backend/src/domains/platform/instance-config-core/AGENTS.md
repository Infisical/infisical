# Instance Config Core domain

The instance's configuration: the single `super_admin` row (settings, the Slack, Teams and GitHub app credentials, env
overrides), cached for every pod, and the env overrides applied to this process's env holder. Owns `super_admin`.
Depends only on KMS Core, for the root key that encrypts credentials and env overrides. Instance Admin
(`src/services/super-admin/`) keeps the admin console, the login-method lockout guard and the Teams bot re-init, and
saves through `updateConfig`.

| Layer | Holds |
| --- | --- |
| `ce/model/` | `InstanceConfig`, the row. `toSettings()` returns only the fields in `InstanceConfig.SETTING_FIELDS` |
| `ce/data-access/` | `InstanceConfigDataAccess` (`super_admin`, the fixed `INSTANCE_CONFIG_ID`, the boot reads `readFipsSetting` and `readInitialized`), `ServerConfigCache` (the shared Redis entry; key store only) |
| `ce/service/` | `InstanceConfigService`, every use case; `IntegrationCredentialsHolder`, the decrypted credentials of this process; `TInstanceConfigEnv`, what `domains.ts` passes in from `lib/config/env.ts` |

## Rules

- **Read config through the domain.** `getServerConfig()` returns the settings without credentials;
  `getAdminIdentityIds()`, `getSlackCredentials()` (stored, else `WORKFLOW_SLACK_CLIENT_ID`/`SECRET` from env) and
  `getMicrosoftTeamsCredentials()` return what their names say. Never read `super_admin` or decrypt its columns
  anywhere else.
- **Settings are an allowlist.** `toSettings()` picks `InstanceConfig.SETTING_FIELDS`, so a new column never reaches a
  response until it is listed there. A new column that is a ciphertext goes in `TEncryptedColumn` instead; the model
  test fails until every column is in one of the two.
- **The cache key, TTL and value are frozen** (`server-config-cache.ts`): `infisical-admin-cfg`, 60 seconds, the full
  joined row with ciphertext as Buffer JSON. Pods of the previous release share the entry during a rolling deploy and
  their Slack code decrypts from it, so caching a narrower value under that key breaks them.
- **Cross-pod model.** An update rewrites the shared cache entry after commit, so every pod reads the change on its next
  read. A caller acting on its own update passes `{ readFrom: ReadFrom.Primary }` to read the committed row instead
  (the Teams bot re-init does). Credentials are decrypted per integration, held for the row's `updatedAt`, and decrypted
  again when it changes, so a column that cannot be decrypted breaks only its own integration. Env overrides live in
  each process's env holder and reach other pods within the five-minute refresh `start()` registers. Teams runs its own
  five-minute sync, keyed on `updatedAt`, to rebuild its bot.
- **Encrypt before the transaction.** `updateConfig` encrypts with the root key, then writes, then in `afterCommit`
  rewrites the cache and applies new env overrides to this process. Slack and Teams credentials can be changed but not
  cleared (an empty value is refused by name); GitHub app credentials and env overrides take `""`.
- **Boot order.** `initialize()` creates the row and clears the cache; it never decrypts, because it runs before KMS
  Core starts. `start()` decrypts, so it runs after `kmsCore.start()`. With no row yet, as on a replica that has not
  caught up with `initialize()`, there are no env overrides and boot continues.
- **Boot FIPS read.** `crypto.initialize` and `initEnvConfig` take a loader, `() => InstanceConfigCoreModule.readFipsSetting(knex)`,
  and call it only when `FIPS_ENABLED=true`. It returns `null` when the table or the row is missing (a new instance),
  otherwise `fipsEnabled`; any other error is thrown, so a database failure can never be mistaken for a new FIPS
  deployment.
- **Create the row with `INSERT ... ON CONFLICT (id) DO NOTHING`, then read it** (`createIfMissing`). Concurrent
  boots each get the one row; read-then-insert would fail all but one of them on the primary key.
- **Keep `ce/module.ts` cheap to import.** `main.ts` imports it before anything else boots. `lib/config/env.ts` reaches
  the domain only as `TInstanceConfigEnv`, built in `domains.ts`; `@app/lib/cron/*` and the key store come in through
  deps.

## Env config and instance config

`lib/config/env.ts` stays the parser and the synchronous holder of the effective env (process env plus the stored
overrides), because it is needed before the database exists, by migrations and by `lib/` code. This domain is the only
code that stores overrides or applies them (`overrideEnvConfig`). Overridable keys are read through `getConfig()` from
`lib/config/env.ts` like any env value, so code that captures them once at boot never sees an override (the GitHub
Radar app in `server/plugins/secret-scanner-v2.ts`), and SSO strategies (`server/routes/v1/sso-router.ts`), which
re-register on their own five-minute timer, can take up to about ten minutes to see one.

## Declared exceptions

- `InstanceConfigDataAccess.findById` joins `organizations`, `saml_configs` and `oidc_configs` for the default auth org
  (`defaultAuthOrgSlug`, `defaultAuthOrgAuthEnforced`, `defaultAuthOrgAuthMethod`), until Organizations & Projects and
  User Accounts expose that data.
- The `encryptedGitHubAppConnection*` columns are written by `PATCH /api/v1/admin/config` and returned by
  `GET /api/v1/admin/integrations`, but no product code reads them; GitHub app credentials are env overrides.

## Tests

`ce/testing/build-instance-config-core.ts` builds the module over `InMemoryInstanceConfigCoreDataAccess`,
`InMemoryKeyStore`, `FakeInstanceConfigEnv` and KMS Core's `FakeKmsCoreDomain`; pass another build's `inMemory` and
`keyStore` to get a second pod. Consumers use `FakeInstanceConfigCoreDomain`, constructed with the settings the test
needs. `instance-config-data-access-contract.ts` runs against both data access classes. Integration specs use
`setupIntegration({ freshDatabase: true })`, since `super_admin` is one row for the instance.
