import { TDataAccessLocks } from "../data-access-locks";
import { runAfterCommitHooks, TRunContext, TTransaction, TTransactionRunner } from "../transaction-runner";
import { KeyedMutex } from "@app/domains/lib/transactions/testing/keyed-mutex";

export type TSnapshotState = {
  snapshot(): unknown;
  restore(snapshot: unknown): void;
};

type TInMemoryTransaction = TTransaction & { readonly locks: TDataAccessLocks };

type TRunnerShared<TDataAccess> = {
  state: TSnapshotState;
  buildDataAccess: (locks: TDataAccessLocks) => TDataAccess;
  mutex: KeyedMutex;
};

// Like TransactionRunner, in memory: restores the data access on throw, runs afterCommit only on success,
// joins via within(tx), per-key locks held until the outermost run ends. No isolation though: a failed run
// restores its starting snapshot, wiping writes other runs committed meanwhile, so don't overlap runs and
// count on rollback.
export class InMemoryTransactionRunner<TDataAccess> implements TTransactionRunner<TDataAccess> {
  private readonly shared: TRunnerShared<TDataAccess>;

  constructor(
    state: TSnapshotState,
    buildDataAccess: (locks: TDataAccessLocks) => TDataAccess,
    private readonly parent?: TInMemoryTransaction,
    shared?: TRunnerShared<TDataAccess>
  ) {
    this.shared = shared ?? { state, buildDataAccess, mutex: new KeyedMutex() };
  }

  within(tx: TTransaction): InMemoryTransactionRunner<TDataAccess> {
    return new InMemoryTransactionRunner(
      this.shared.state,
      this.shared.buildDataAccess,
      tx as TInMemoryTransaction,
      this.shared
    );
  }

  async run<T>(work: (ctx: TRunContext<TDataAccess>) => Promise<T>): Promise<T> {
    if (this.parent) {
      return work({ dataAccess: this.shared.buildDataAccess(this.parent.locks), tx: this.parent });
    }

    const hooks: Array<() => Promise<void>> = [];
    const releases: Array<() => void> = [];
    const locks: TDataAccessLocks = {
      acquire: async (key: string) => {
        const release = await this.shared.mutex.acquire(key);
        releases.push(release);
      }
    };
    const tx = { afterCommit: (fn: () => Promise<void>) => hooks.push(fn), locks } as unknown as TInMemoryTransaction;
    const before = this.shared.state.snapshot();

    let result: T;
    try {
      result = await work({ dataAccess: this.shared.buildDataAccess(locks), tx });
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
