import { TDataAccessLocks } from "@app/domains/lib/data-access-locks";
import { InMemoryTransactionRunner } from "@app/domains/lib/testing/in-memory-transaction-runner";

import { TKmsCoreDataAccess } from "../data-access/kms-core-data-access";
import { noKmsCoreLocks } from "../data-access/kms-core-locks";
import { TKmsCoreDataAccessDeps } from "../module";
import { InMemoryKekHistoryDataAccess } from "./in-memory-kek-history-data-access";
import { InMemoryKmsCoreLocks } from "./in-memory-kms-core-locks";
import { InMemoryKmsCoreState } from "./in-memory-kms-core-state";
import { InMemoryKmsKeyDataAccess } from "./in-memory-kms-key-data-access";
import { InMemoryKmsKeyVersionDataAccess } from "./in-memory-kms-key-version-data-access";
import { InMemoryLegacyEncryptionKeyDataAccess } from "./in-memory-legacy-encryption-key-data-access";
import { InMemoryRootKeyConfigDataAccess } from "./in-memory-root-key-config-data-access";
import { InMemoryScopeKeyDataAccess } from "./in-memory-scope-key-data-access";

// The in-memory data access classes ignore TReadOptions: there is one copy of every row.
const buildDataAccess = (state: InMemoryKmsCoreState, locks?: TDataAccessLocks): TKmsCoreDataAccess => ({
  kmsKeys: new InMemoryKmsKeyDataAccess(state),
  kmsKeyVersions: new InMemoryKmsKeyVersionDataAccess(state),
  rootKeyConfigs: new InMemoryRootKeyConfigDataAccess(state),
  kekHistory: new InMemoryKekHistoryDataAccess(state),
  legacyEncryptionKeys: new InMemoryLegacyEncryptionKeyDataAccess(state),
  scopeKeys: new InMemoryScopeKeyDataAccess(state),
  locks: locks ? new InMemoryKmsCoreLocks(locks) : noKmsCoreLocks
});

// KMS Core's data access in memory: one state behind the transaction runner and the data access outside it.
export class InMemoryKmsCoreDataAccess implements TKmsCoreDataAccessDeps {
  readonly state = new InMemoryKmsCoreState();

  readonly transactionRunner: TKmsCoreDataAccessDeps["transactionRunner"];

  readonly dataAccess: TKmsCoreDataAccess;

  constructor() {
    const { state } = this;
    this.transactionRunner = new InMemoryTransactionRunner(state, (locks) => buildDataAccess(state, locks));
    this.dataAccess = buildDataAccess(state);
  }
}
