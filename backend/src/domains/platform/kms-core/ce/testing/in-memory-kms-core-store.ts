import { TStoreLocks } from "@app/domains/lib/store-locks";
import { InMemoryTransactionRunner } from "@app/domains/lib/testing/in-memory-transaction-runner";

import { noKmsCoreLocks } from "../data-access/kms-core-locks";
import { TKmsCoreStore } from "../data-access/kms-core-store";
import { TKmsCoreStorage } from "../module";
import { InMemoryKekHistoryDataAccess } from "./in-memory-kek-history-data-access";
import { InMemoryKmsCoreLocks } from "./in-memory-kms-core-locks";
import { InMemoryKmsCoreState } from "./in-memory-kms-core-state";
import { InMemoryKmsKeyDataAccess } from "./in-memory-kms-key-data-access";
import { InMemoryKmsKeyVersionDataAccess } from "./in-memory-kms-key-version-data-access";
import { InMemoryLegacyEncryptionKeyDataAccess } from "./in-memory-legacy-encryption-key-data-access";
import { InMemoryRootKeyConfigDataAccess } from "./in-memory-root-key-config-data-access";
import { InMemoryScopeKeyDataAccess } from "./in-memory-scope-key-data-access";

const buildStore = (state: InMemoryKmsCoreState, locks?: TStoreLocks): TKmsCoreStore => ({
  kmsKeys: new InMemoryKmsKeyDataAccess(state),
  kmsKeyVersions: new InMemoryKmsKeyVersionDataAccess(state),
  rootKeyConfigs: new InMemoryRootKeyConfigDataAccess(state),
  kekHistory: new InMemoryKekHistoryDataAccess(state),
  legacyEncryptionKeys: new InMemoryLegacyEncryptionKeyDataAccess(state),
  scopeKeys: new InMemoryScopeKeyDataAccess(state),
  locks: locks ? new InMemoryKmsCoreLocks(locks) : noKmsCoreLocks
});

// KMS Core's storage in memory: one state behind the runner, the replica and the primary.
export class InMemoryKmsCoreStore {
  readonly state = new InMemoryKmsCoreState();

  readonly storage: TKmsCoreStorage;

  constructor() {
    const { state } = this;
    const reads = buildStore(state);
    this.storage = {
      runner: new InMemoryTransactionRunner(state, (locks) => buildStore(state, locks)),
      replica: reads,
      primary: reads
    };
  }
}
