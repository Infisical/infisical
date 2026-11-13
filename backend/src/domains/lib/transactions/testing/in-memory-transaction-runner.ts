import { TStoreLocks } from "../store-locks";
import { runAfterCommitHooks, TRunContext, TTransaction, TTransactionRunner } from "../transaction-runner";
import { KeyedMutex } from "./keyed-mutex";

export type TSnapshotState = {
  snapshot(): unknown;
  restore(snapshot: unknown): void;
};

type TInMemoryTransaction = TTransaction & { readonly locks: TStoreLocks };

type TRunnerShared<TStore> = {
  state: TSnapshotState;
  buildStore: (locks: TStoreLocks) => TStore;
  mutex: KeyedMutex;
};

// No isolation: a failed run restores its starting snapshot and wipes whatever other runs committed
// meanwhile, so don't overlap runs and count on rollback.
export class InMemoryTransactionRunner<TStore> implements TTransactionRunner<TStore> {
  private readonly shared: TRunnerShared<TStore>;

  constructor(
    state: TSnapshotState,
    buildStore: (locks: TStoreLocks) => TStore,
    private readonly parent?: TInMemoryTransaction,
    shared?: TRunnerShared<TStore>
  ) {
    this.shared = shared ?? { state, buildStore, mutex: new KeyedMutex() };
  }

  within(tx: TTransaction): InMemoryTransactionRunner<TStore> {
    return new InMemoryTransactionRunner(
      this.shared.state,
      this.shared.buildStore,
      tx as TInMemoryTransaction,
      this.shared
    );
  }

  async run<T>(work: (ctx: TRunContext<TStore>) => Promise<T>): Promise<T> {
    if (this.parent) {
      return work({ store: this.shared.buildStore(this.parent.locks), tx: this.parent });
    }

    const hooks: Array<() => Promise<void>> = [];
    const releases: Array<() => void> = [];
    const locks: TStoreLocks = {
      acquire: async (key: string) => {
        releases.push(await this.shared.mutex.acquire(key));
      }
    };
    const tx = { afterCommit: (fn: () => Promise<void>) => hooks.push(fn), locks } as unknown as TInMemoryTransaction;
    const before = this.shared.state.snapshot();

    let result: T;
    try {
      result = await work({ store: this.shared.buildStore(locks), tx });
    } catch (error) {
      this.shared.state.restore(before);
      throw error;
    } finally {
      releases.forEach((release) => release());
    }
    await runAfterCommitHooks(hooks);
    return result;
  }
}
