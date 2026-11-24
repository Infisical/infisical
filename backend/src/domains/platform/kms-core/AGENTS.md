# KMS Core domain

The root key, internal KMS keys, org and project keys (the KMS key and data key each gets on first use, and the
project certificate key), root key rotation, and, through the enterprise edition, HSM root key wrapping and external
KMS keys (AWS, GCP). Depends on no other domain. Every product that encrypts calls it; CMEK and KMIP are the KMS
product built on it.

| Layer             | Holds                                                                                                                                                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ce/models/`      | `KmsKey` (`kms_keys` + `internal_kms` + `external_kms`), `KeyMaterial`, `RootKey`, `RootKeyConfig`, `RootKeyRing`, `KekHistoryEntry`, `OrganizationKey`, `ProjectKey`, `DataKey`, `EncryptedDataKey`, and the frozen formats (`KmsCiphertext`, `WrappedKeyPayload`, `ProjectKeyBackup`, `InstanceEncryptionKey`) |
| `ce/data-access/` | One store per entity, `kms-core-locks.ts` (the frozen lock ids), `kms-core-stores.ts` (`buildKmsCoreStoreAccess`), `project-data-key-cache.ts` (Redis)                                                                                                                                                           |
| `ce/services/`    | `root-key/` (`KmsRootKeyService`, `RootKeyLoader`, `RootKeyWrappings`: the software or HSM wrapping per strategy), `kms-key/` (`KmsKeyService`), `data-key/` (`KmsDataKeyService`), `helpers/key-cipher.ts` (`KeyCipher`: internal or external key dispatch, one per store binding), `dependencies.ts` (store, cache and enterprise port types) |
| `ee/`             | `models/` (`AwsProviderInputs`, `ExternalKmsProviderInputsVersion`), `clients/hsm/` (PKCS#11 client, `HsmRootKeyWrapper`), `clients/external-kms/` (AWS, GCP), `services/external-key-cipher/` (`ExternalKeyCipherService`), `KmsCoreEeModule` handing both to CE as `TKmsCoreHooks`; `services/external-kms/` (`ExternalKmsService`, key management) built by `ExternalKmsEeModule` |

`KmsCoreModule.create` loads the root key (from the env key or the HSM, bootstrapping it on a new instance) before any
service exists and passes the same `RootKey` to each, so a service never runs without it. The module exposes
`kmsDataKeyService`, `kmsKeyService` and `kmsRootKeyService`, and consumers take the one they call under the same
name. The `kms` prefix keeps a deps list readable next to DALs and other services.

## Transactions

- **KMS Core joins a caller's transaction** through `kmsDataKeyService.within(tx)` and `kmsKeyService.within(tx)`;
  "KMS Core joins transactions" in `src/domains/AGENTS.md` lists what joins and the rules for callers. Legacy code
  passes `sealKnexTransaction(trx)`. A joined call sees the caller's uncommitted rows, so a project created in the
  same transaction gets its keys there.
- **A joined service is built on the transaction's stores and without the cache** (`within` in each service). Never
  read through `this.stores` (the replica) on a path `within` exposes, and never let a joined path touch the cache.
- **A joined call takes no savepoint**, so a database error aborts the caller's transaction, and anything that relied
  on rolling back its own work does it explicitly instead: a lost certificate key claim deletes the key it inserted.
  Any error from a joined call means the caller rolls back.
- **Closures must not outlive the transaction.** `kmsKeyService.within(tx).decryptWithKmsKey` loads archived key
  versions up front (the `KeyCipher` from `keyCipher.joined(stores)`), because a decryptor called after the commit cannot
  use the transaction.
- **First use writes only an empty column, under the frozen locks.** Org and project keys take the advisory lock,
  re-read and claim (`claimKmsKey`, `claimDataKey`); joined, the lock is held until the caller commits. The certificate
  key is a compare-and-swap (`claimCertificateKey`).
- **External keys call the provider wherever the call runs**, inside a caller's transaction too. Key generation and
  import validation (`KeyMaterial.generate`/`import`) run before `run`.
- **Lock ids are frozen** (`KMS_LOCK_IDS` in `data-access/kms-core-locks.ts`): `pg_advisory_xact_lock(2025)` for the
  root key and `pgAdvisoryLockHashText("kms-org-key:<id>")` (and `kms-org-data-key`, `kms-project-key`,
  `kms-project-data-key`). Pods of the previous release take these exact ids during a deploy. The generic
  `TStoreLocks` hashes differently, so `buildKmsCoreStoreAccess` gives the runner `PostgresKmsCoreLocks` and ignores
  the generic locks. Take them in the order root key, org, project; key before data key.
- **Root key state reads the primary** (`{ readFrom: ReadFrom.Primary }`, or inside `run` where a lock is taken): a
  lagging replica could miss the key this pod holds, or show a superseded view to promote against. Boot bookkeeping
  re-reads a row under the root key lock before saving it.

## Project data-key cache

`ProjectDataKeyCache` keeps a project's encrypted data key in Redis so the hot path skips the project row.

- **Key, TTL and payload are frozen**: `kms-project-sm-material:<projectId>`, 300 s,
  `{"kmsSecretManagerKeyId","kmsSecretManagerEncryptedDataKey" (base64),"orgId"}` in that order. Pods of the previous
  release read and write the same entries during a deploy, and they write partial entries, which read as a miss.
- **It holds only what the project row holds**, never plaintext, and it is filled from the primary.
- **Never inside a transaction and never for a primary read**: an entry written from a transaction that rolls back
  would name a key that does not exist.
- **A key switch evicts after commit; a backup restore evicts before the write** (and is refused if Redis cannot
  evict, since a stale entry would keep serving the replaced data key) **and again after commit.**
- **A refill reads the project row again after writing** and drops the entry if a key switch committed meanwhile, so
  a slow miss cannot write back a key the switch just evicted.
- **An entry that does not open** (a key deleted since, an eviction that failed) is read again from the primary once
  and replaced.

## Formats

- **The wire format is frozen**: AES-GCM `iv(12)||ct||tag(16)`; internal key blobs end in `v01`, or
  `[u32BE version]v02` once the key has been rotated; data-key and input-key blobs always end in `v01`; wrapped keys are
  `sha256(label)||key`; backups are `v1.<projectId>.secretManager.<kmsKeyId>.<base64>.<sha256hex>`; HSM blobs are
  `[iv16][CBC-PAD ct][HMAC32]`. `ce/testing/fixtures/kms-wire-format.json` holds what the previous service wrote;
  `models/wire-format.test.ts`, `services/wire-format.test.ts` and `services/wire-format.integration-test.ts` must keep
  decrypting it.
- **The root key never leaves the domain.** Callers encrypt and decrypt with it (`encryptWithRootKey`) and get a key
  derived from it (`getCookieSigningKey`). The checks on the env key that wraps it (missing `ENCRYPTION_KEY`, its FIPS
  format) run in `RootKeyLoader`, not in `crypto.initialize`.

## Licensing and editions

- **KMS Core never calls License.** HSM: `createDomains` passes `isHsmEntitled` to `KmsCoreEeModule.create`, a getter
  so a license refreshed after boot takes effect, and an HSM root config or a switch to HSM is refused through
  `rootKeyWrapper.assertEntitled()`; migrations answer `true`. External KMS: the caller
  (`src/ee/services/external-kms/external-kms-service.ts`) checks the plan on create, update and GCP key listing;
  using an existing external key is never gated.
- **External KMS lives in `ee/`** but its rows are part of the `KmsKey` entity, owned by `KmsKeyStore`. It is two
  pieces built at different times, and nothing else in CE knows about external key management:
  - `ExternalKeyCipherService` (the `TExternalKmsHook`: assertInputsAllowed, encrypt, decrypt) is built with
    `KmsCoreEeModule` *before* KMS Core, which calls it whenever a data key sits behind AWS or GCP. It cannot hold KMS
    Core, so CE hands it the org data-key cipher on every call. `KeyCipher` awaits `assertInputsAllowed` before it
    returns an encryptor or decryptor, never inside one: it reads the database, and a closure built on a caller's
    transaction may run after that commits.
  - `ExternalKmsService` (`TExternalKmsService`: create, update, delete, read, list, GCP key listing) is built by
    `ExternalKmsEeModule` in `domains.ts` *after* KMS Core, from `kmsDataKeyService`. KMS Core never calls it; the
    type lives in CE only so legacy code can import it from `ce/module`.
  CE never imports `@app/ee/**` (lint). Without the hook, external keys and an HSM root config fail with a readable
  error.
- **An AWS assume-role external ID is the organization ID** (`AwsProviderInputs` in `ee/models/`), or a role could be
  pointed at another organization's trust policy. `external_kms.providerInputsVersion` records the rules a row was
  saved under: `2` binds the ID to the org, `1` (the column default, so old pods stay legacy during a deploy) sends the
  stored ID unless it names another organization or one of its projects. Every new key is written as `2`, and a
  credential change moves a legacy row to `2`. Decide these through the model, never by comparing the version in a
  service; `assertAwsInputsAllowed` (`ee/services/helpers/`) only runs the lookups the model asks for.
  `ExternalKmsService.update` checks inputs outside the transaction, before AssumeRole, and again inside `run` on the
  transaction's stores, because the project the ID names may be created meanwhile. `KmsKey.replaceProviderInputs`
  takes the key as read and refuses with `StateConflictError` if the stored inputs or version changed since.
- **Migrations and scripts** use `startStandaloneKmsCore` from `domains.ts`: every query runs on the connection it is
  given (a migration's own transaction, so KMS Core's transactions nest as savepoints), only the root key is loaded,
  and there is no cache. It returns the module; take the services from it.

## Declared exceptions

- The key columns on `organizations` (`kmsDefaultKeyId`, `kmsEncryptedDataKey`) and `projects`
  (`kmsSecretManagerKeyId`, `kmsSecretManagerEncryptedDataKey`, `kmsCertificateKeyId`) belong to tables no domain
  owns yet; `OrganizationKeyStore` and `ProjectKeyStore` write only these columns. Project create also sets
  `kmsSecretManagerKeyId` to an external key it checked with `kmsKeyService.within(tx).getKmsById`.
- `kms_keys.orgId` and `kms_keys.projectId` cascade from `organizations` and `projects`: deleting an org or a CMEK
  project removes its keys without telling KMS Core.
- `countProjectKeysInOrg` joins `projects` to count a product's keys for org stats.
- `OrganizationKeyStore.isOrganization` and `ProjectKeyStore.findOrgIdIncludingPendingDeletion` read `organizations`
  and `projects` for the external ID check. The hook gets the call's own stores as `TInfisicalIdLookup`, so a joined
  call reads its caller's transaction.

## Tests

- `ce/testing/build-kms-core.ts`: `buildInMemoryKmsCore` over `InMemoryKmsCoreStores` (load fixture rows into
  `memory` first, the root key is loaded while building) and `buildPostgresKmsCore` on an integration database, whose
  template already holds a root key wrapped with the test encryption key.
- Each store has a contract suite (`testing/*-store-contract.ts`) run against the in-memory and the Postgres store.
- Consumers use `FakeKmsCore`: the real services over in-memory stores, creating orgs and projects the first time a
  test names them, with `within()` ignoring the transaction it is handed.
- `ee/testing/FakeExternalKmsProviders` stands in for AWS and GCP.
