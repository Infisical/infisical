import { Knex } from "knex";

import { KekHistoryDataAccess, TKekHistoryDataAccess } from "./kek-history-data-access";
import { noKmsCoreLocks, PostgresKmsCoreLocks, TKmsCoreLocks } from "./kms-core-locks";
import { KmsKeyDataAccess, TKmsKeyDataAccess } from "./kms-key-data-access";
import { KmsKeyVersionDataAccess, TKmsKeyVersionDataAccess } from "./kms-key-version-data-access";
import { LegacyEncryptionKeyDataAccess, TLegacyEncryptionKeyDataAccess } from "./legacy-encryption-key-data-access";
import { RootKeyConfigDataAccess, TRootKeyConfigDataAccess } from "./root-key-config-data-access";
import { ScopeKeyDataAccess, TScopeKeyDataAccess } from "./scope-key-data-access";

export type TKmsCoreStore = {
  kmsKeys: TKmsKeyDataAccess;
  kmsKeyVersions: TKmsKeyVersionDataAccess;
  rootKeyConfigs: TRootKeyConfigDataAccess;
  kekHistory: TKekHistoryDataAccess;
  legacyEncryptionKeys: TLegacyEncryptionKeyDataAccess;
  scopeKeys: TScopeKeyDataAccess;
  locks: TKmsCoreLocks;
};

export const buildKmsCoreReadStore = (db: Knex): TKmsCoreStore => ({
  kmsKeys: new KmsKeyDataAccess(db),
  kmsKeyVersions: new KmsKeyVersionDataAccess(db),
  rootKeyConfigs: new RootKeyConfigDataAccess(db),
  kekHistory: new KekHistoryDataAccess(db),
  legacyEncryptionKeys: new LegacyEncryptionKeyDataAccess(db),
  scopeKeys: new ScopeKeyDataAccess(db),
  locks: noKmsCoreLocks
});

// Inside a transaction: the KMS lock ids, not the generic store locks (see kms-core-locks.ts).
export const buildKmsCoreStore = (trx: Knex): TKmsCoreStore => ({
  ...buildKmsCoreReadStore(trx),
  locks: new PostgresKmsCoreLocks(trx)
});
