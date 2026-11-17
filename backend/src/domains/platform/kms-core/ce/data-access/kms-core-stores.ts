import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { poolStoreConnection, singleStoreConnection, TStoreConnection } from "@app/domains/lib/data-access";
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

const buildKmsCoreStores = (connection: TStoreConnection, locks: TKmsCoreLocks): TKmsCoreStores => ({
  kmsKeyStore: new KmsKeyStore(connection),
  kmsKeyVersionStore: new KmsKeyVersionStore(connection),
  rootKeyConfigStore: new RootKeyConfigStore(connection),
  kekHistoryStore: new KekHistoryStore(connection),
  legacyEncryptionKeyStore: new LegacyEncryptionKeyStore(connection),
  organizationKeyStore: new OrganizationKeyStore(connection),
  projectKeyStore: new ProjectKeyStore(connection),
  locks
});

// `db` is the server's client or a migration's own connection. `readKnex` is the replica on the server, but the same
// connection in a migration (never the global replica).
// Uses KMS Core's frozen lock ids instead of the runner's generic store locks: pods of the previous release share
// them during a deploy.
export const buildKmsCoreStoreAccess = (db: TDbClient, readKnex: () => Knex) => ({
  transactionRunner: new TransactionRunner<TKmsCoreStores>(db, (trx) =>
    buildKmsCoreStores(singleStoreConnection(trx), new PostgresKmsCoreLocks(trx))
  ),
  stores: buildKmsCoreStores(poolStoreConnection(db, readKnex), noKmsCoreLocks)
});
