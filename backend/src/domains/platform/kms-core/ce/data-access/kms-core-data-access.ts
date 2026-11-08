import { DataAccessDb } from "@app/domains/lib/data-access-db";

import { KekHistoryDataAccess, TKekHistoryDataAccess } from "./kek-history-data-access";
import { TKmsCoreLocks } from "./kms-core-locks";
import { KmsKeyDataAccess, TKmsKeyDataAccess } from "./kms-key-data-access";
import { KmsKeyVersionDataAccess, TKmsKeyVersionDataAccess } from "./kms-key-version-data-access";
import { LegacyEncryptionKeyDataAccess, TLegacyEncryptionKeyDataAccess } from "./legacy-encryption-key-data-access";
import { RootKeyConfigDataAccess, TRootKeyConfigDataAccess } from "./root-key-config-data-access";
import { ScopeKeyDataAccess, TScopeKeyDataAccess } from "./scope-key-data-access";

export type TKmsCoreDataAccess = {
  kmsKeys: TKmsKeyDataAccess;
  kmsKeyVersions: TKmsKeyVersionDataAccess;
  rootKeyConfigs: TRootKeyConfigDataAccess;
  kekHistory: TKekHistoryDataAccess;
  legacyEncryptionKeys: TLegacyEncryptionKeyDataAccess;
  scopeKeys: TScopeKeyDataAccess;
  locks: TKmsCoreLocks;
};

// Inside a transaction locks are the frozen KMS lock ids (PostgresKmsCoreLocks), not the generic data access locks;
// outside one they are noKmsCoreLocks.
export const buildKmsCoreDataAccess = (db: DataAccessDb, locks: TKmsCoreLocks): TKmsCoreDataAccess => ({
  kmsKeys: new KmsKeyDataAccess(db),
  kmsKeyVersions: new KmsKeyVersionDataAccess(db),
  rootKeyConfigs: new RootKeyConfigDataAccess(db),
  kekHistory: new KekHistoryDataAccess(db),
  legacyEncryptionKeys: new LegacyEncryptionKeyDataAccess(db),
  scopeKeys: new ScopeKeyDataAccess(db),
  locks
});
