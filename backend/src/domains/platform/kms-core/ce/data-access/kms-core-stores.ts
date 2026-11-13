import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TransactionRunner } from "@app/domains/lib/transactions";

import { TKmsCoreLocks, TKmsCoreStores } from "../services/dependencies";
import { KekHistoryStore } from "./kek-history-store";
import { noKmsCoreLocks, PostgresKmsCoreLocks } from "./kms-core-locks";
import { KmsKeyStore } from "./kms-key-store";
import { KmsKeyVersionStore } from "./kms-key-version-store";
import { LegacyEncryptionKeyStore } from "./legacy-encryption-key-store";
import { OrganizationKeyStore } from "./organization-key-store";
import { ProjectKeyStore } from "./project-key-store";
import { RootKeyConfigStore } from "./root-key-config-store";

export const buildKmsCoreStores = (knex: () => Knex, locks: TKmsCoreLocks): TKmsCoreStores => ({
  kmsKeyStore: new KmsKeyStore(knex),
  kmsKeyVersionStore: new KmsKeyVersionStore(knex),
  rootKeyConfigStore: new RootKeyConfigStore(knex),
  kekHistoryStore: new KekHistoryStore(knex),
  legacyEncryptionKeyStore: new LegacyEncryptionKeyStore(knex),
  organizationKeyStore: new OrganizationKeyStore(knex),
  projectKeyStore: new ProjectKeyStore(knex),
  locks
});

// `db` is the server's client, or a migration's own connection. `readKnex` is what stores read through outside a
// transaction: the replica on the server, the same connection in a migration (never the global replica).
// The runner's generic store locks are not used: KMS Core takes its frozen lock ids, which pods of the previous
// release share during a deploy.
export const buildKmsCoreStoreAccess = (db: TDbClient, readKnex: () => Knex) => ({
  transactionRunner: new TransactionRunner<TKmsCoreStores>(db, (trx) =>
    buildKmsCoreStores(() => trx, new PostgresKmsCoreLocks(trx))
  ),
  stores: buildKmsCoreStores(readKnex, noKmsCoreLocks)
});
