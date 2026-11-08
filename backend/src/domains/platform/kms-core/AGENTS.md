# KMS Core domain

The root key, internal KMS keys, org and project keys (the KMS key and data key each scope gets on first use, and
the project certificate key), root key rotation, and, through the enterprise hooks, HSM root key wrapping and external
KMS keys (AWS, GCP). Depends on no other domain. CMEK and KMIP are the KMS product and call it through
`TKmsCoreDomain`; so does every other service that encrypts.

| Layer | Holds |
| --- | --- |
| `ce/model/` | `KmsKey` (`kms_keys` + `internal_kms` + `external_kms`), `KmsKeyVersion`, `RootKeyConfig`, `KekHistoryEntry`, `LegacyEncryptionKey`, `ScopeKey`, and the frozen formats: `KmsCiphertext`, `WrappedKeyPayload`, `ProjectKeyBackup`, `InstanceEncryptionKey` |
| `ce/data-access/` | One class per model, `KmsCoreLocks` (the frozen lock ids), `buildKmsCoreStore(trx)` and `buildKmsCoreReadStore(db)` |
| `ce/service/` | `RootKeyService`, `RootKeyRotationService`, `KmsKeyService`, `KmsCryptoService`, `ScopeKeyService`; `key-material.ts` (helpers they share); `TKmsCoreHooks` |
| `ee/` | `HsmRootKeyWrapper` over the PKCS#11 client (`hsm-client/`), `ExternalKmsService` over the provider clients (`external-kms-client/`), `KmsCoreEeModule` providing both as hooks |

## Rules

- **Never call KMS Core inside a caller's transaction.** It has no `within(tx)`. Fetch ciphers, key ids and key
  material before opening the transaction; delete keys after it commits (`deleteProjectKeys`). A secret write that
  runs inside a caller's transaction takes its ciphers through `TSecretWriteTransaction`
  (`prepareSecretWriteCiphers` in `secret-v2-bridge-fns.ts`); validation takes the project cipher as an argument.
  KMS Core reads on its own connection, so it cannot see rows a caller has not committed: a caller that creates a
  project and encrypts for it commits the project first (see `external-migration-fns/import.ts`).
- **No network or HSM call inside a KMS Core transaction.** External-key data keys are encrypted with the provider
  before the lock is taken; a key switch re-wraps the data key before its transaction; provider decrypts run after the
  read returns. Root key wrapping (HSM) happens before the bootstrap and strategy-change transactions.
- **First-use creation is a short transaction that writes only an empty column.** Org and project keys take the
  frozen advisory locks and re-read; the project certificate key is a compare-and-swap
  (`setProjectCertificateKmsKeyId` writes only when the column is null, and the loser rolls back with its key).
  Every `ScopeKeyDataAccess.set*` writes only when the column is empty.
- **Lock ids are frozen** (`KMS_LOCK_IDS` in `data-access/kms-core-locks.ts`): `pg_advisory_xact_lock` with `2025` for
  the root key and `pgAdvisoryLockHashText("kms-org-key:<id>")` (and `kms-org-data-key`, `kms-project-key`,
  `kms-project-data-key`). Pods of the previous release take these exact ids during a rolling deploy; the generic
  `store.locks.acquire` hashes differently and must not be used here. Take them in the order root key, org,
  project; key before data key.
- **The wire format is frozen**: AES-GCM `iv(12)||ct||tag(16)`; internal key blobs end in `v01`, or
  `[u32BE version]v02` once the key has been rotated; data-key and input-key blobs always end in `v01`; wrapped keys are
  `sha256(label)||key`; backups are `v1.<projectId>.secretManager.<kmsKeyId>.<base64>.<sha256hex>`; HSM blobs are
  `[iv16][CBC-PAD ct][HMAC32]`. `ce/testing/fixtures/kms-wire-format.json` holds what the previous service wrote, and
  `wire-format.test.ts` and `root-key-service.integration.spec.ts` must keep decrypting it.
- **The root key never leaves the domain.** Callers encrypt and decrypt with it (`encryptWithRootKey`), and get a key
  derived from it (`getCookieSigningKey`). The checks on the env key that wraps it (missing `ENCRYPTION_KEY`, its FIPS
  format) run in `RootKeyService.start`, not in `crypto.initialize`.
- **No cache of key material.** Every cipher pair reads the key columns (replica first, primary after a creation).
- **Licensing stays outside.** KMS Core never calls License. HSM: `domains.ts` boot passes
  `licenseDomain.hasInstanceFeature("hsm")` to `kmsCoreEe.start({ hsmEntitled })`, and `RootKeyService` refuses an HSM
  root config or a switch to HSM through `rootKeyWrapper.assertEntitled()`; migrations start with `hsmEntitled: true`
  (`startStandaloneKmsCore`). External KMS: the caller (`src/ee/services/external-kms/external-kms-service.ts`)
  checks `externalKms` on create, update and GCP key listing; using an existing external key is never gated.
- **External KMS lives in `ee/`** but its rows are part of the `KmsKey` entity, owned by `KmsKeyDataAccess`. CE hands
  the enterprise hook the org data-key cipher on every call (`createExternalKms`, `encrypt`, ...), so `ee/` never holds
  the community module. Without the hook, external keys and an HSM root config fail with a readable error.
- **Migrations and scripts** use `startStandaloneKmsCore` from `domains.ts`: it runs every query on the connection it is
  given (a migration's own transaction, so KMS Core's transactions nest as savepoints) and loads only the root key.

## Declared exceptions

- The key columns on `organizations` (`kmsDefaultKeyId`, `kmsEncryptedDataKey`) and `projects`
  (`kmsSecretManagerKeyId`, `kmsSecretManagerEncryptedDataKey`, `kmsCertificateKeyId`) belong to tables no domain
  owns yet; `ScopeKeyDataAccess` writes only these columns. Project create also sets `kmsSecretManagerKeyId` to an
  external key it validated with `getKmsById`.
- `kms_keys.orgId` and `kms_keys.projectId` cascade from `organizations` and `projects`: deleting an org or a CMEK
  project removes its keys without telling KMS Core.
- `countProjectKeysInOrg` joins `projects` to count a product's keys for org stats.

## Tests

`ce/testing/build-kms-core.ts` builds the module over `InMemoryKmsCoreStore`; `build-postgres-kms-core.ts` on an
integration database (whose template already holds a root key wrapped with `TEST_ENCRYPTION_KEY`). Consumers use
`FakeKmsCoreDomain`: the real module over the in-memory store, creating orgs and projects the first time a test names
them. `ee/testing/FakeExternalKmsProviders` stands in for AWS and GCP.
