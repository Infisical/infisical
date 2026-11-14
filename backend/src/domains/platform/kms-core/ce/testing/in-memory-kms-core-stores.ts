import { TStoreLocks } from "@app/domains/lib/transactions";
import { InMemoryTransactionRunner } from "@app/domains/lib/transactions/testing/in-memory-transaction-runner";

import { noKmsCoreLocks } from "../data-access/kms-core-locks";
import { TKmsCoreLocks, TKmsCoreStores } from "../services/dependencies";
import { InMemoryKekHistoryStore } from "./in-memory-kek-history-store";
import { InMemoryKmsCoreLocks } from "./in-memory-kms-core-locks";
import { InMemoryKmsKeyStore } from "./in-memory-kms-key-store";
import { InMemoryKmsKeyVersionStore } from "./in-memory-kms-key-version-store";
import { InMemoryLegacyEncryptionKeyStore } from "./in-memory-legacy-encryption-key-store";
import { InMemoryOrganizationKeyStore } from "./in-memory-organization-key-store";
import { InMemoryPlatformRows } from "./in-memory-platform-rows";
import { InMemoryProjectKeyStore } from "./in-memory-project-key-store";
import { InMemoryRootKeyConfigStore } from "./in-memory-root-key-config-store";

// KMS Core's stores in memory: one state behind the transaction runner and the stores used outside a transaction.
export class InMemoryKmsCoreStores {
  readonly platformRows = new InMemoryPlatformRows();

  readonly kmsKeyVersionStore = new InMemoryKmsKeyVersionStore();

  readonly kmsKeyStore = new InMemoryKmsKeyStore(this.platformRows, this.kmsKeyVersionStore);

  readonly rootKeyConfigStore = new InMemoryRootKeyConfigStore();

  readonly kekHistoryStore = new InMemoryKekHistoryStore();

  readonly legacyEncryptionKeyStore = new InMemoryLegacyEncryptionKeyStore();

  readonly organizationKeyStore = new InMemoryOrganizationKeyStore(this.platformRows);

  readonly projectKeyStore = new InMemoryProjectKeyStore(this.platformRows);

  readonly transactionRunner: InMemoryTransactionRunner<TKmsCoreStores>;

  // Outside a transaction the locks refuse, as they do on Postgres.
  readonly stores: TKmsCoreStores;

  constructor() {
    this.transactionRunner = new InMemoryTransactionRunner<TKmsCoreStores>(this, (locks: TStoreLocks) =>
      this.bundle(new InMemoryKmsCoreLocks(locks))
    );
    this.stores = this.bundle(noKmsCoreLocks);
  }

  snapshot(): unknown {
    return [
      this.platformRows.snapshot(),
      this.kmsKeyVersionStore.snapshot(),
      this.kmsKeyStore.snapshot(),
      this.rootKeyConfigStore.snapshot(),
      this.kekHistoryStore.snapshot(),
      this.legacyEncryptionKeyStore.snapshot()
    ];
  }

  restore(snapshot: unknown) {
    const [platformRows, versions, keys, rootKeyConfigs, kekHistory, legacy] = snapshot as unknown[];
    this.platformRows.restore(platformRows);
    this.kmsKeyVersionStore.restore(versions);
    this.kmsKeyStore.restore(keys);
    this.rootKeyConfigStore.restore(rootKeyConfigs);
    this.kekHistoryStore.restore(kekHistory);
    this.legacyEncryptionKeyStore.restore(legacy);
  }

  private bundle(locks: TKmsCoreLocks): TKmsCoreStores {
    return {
      kmsKeyStore: this.kmsKeyStore,
      kmsKeyVersionStore: this.kmsKeyVersionStore,
      rootKeyConfigStore: this.rootKeyConfigStore,
      kekHistoryStore: this.kekHistoryStore,
      legacyEncryptionKeyStore: this.legacyEncryptionKeyStore,
      organizationKeyStore: this.organizationKeyStore,
      projectKeyStore: this.projectKeyStore,
      locks
    };
  }
}
