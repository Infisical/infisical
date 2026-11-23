import { TStoreLocks } from "@app/domains/lib/transactions";
import { InMemoryTransactionRunner } from "@app/domains/lib/transactions/testing/in-memory-transaction-runner";

import { TInstanceConfigStores } from "../services/dependencies";
import { InMemoryInstanceConfigStore } from "./in-memory-instance-config-store";

// Instance Config Core's stores in memory: one state behind the transaction runner and the store used outside a
// transaction.
export class InMemoryInstanceConfigStores {
  readonly instanceConfigStore = new InMemoryInstanceConfigStore();

  readonly transactionRunner: InMemoryTransactionRunner<TInstanceConfigStores>;

  constructor() {
    this.transactionRunner = new InMemoryTransactionRunner<TInstanceConfigStores>(this, (locks: TStoreLocks) => ({
      instanceConfigStore: this.instanceConfigStore,
      locks
    }));
  }

  snapshot(): unknown {
    return this.instanceConfigStore.snapshot();
  }

  restore(snapshot: unknown) {
    this.instanceConfigStore.restore(snapshot);
  }
}
