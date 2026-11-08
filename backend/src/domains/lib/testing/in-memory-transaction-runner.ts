import { TDataAccessLocks } from "../data-access-locks";
import { runAfterCommitHooks, TRunContext, TTransaction, TTransactionRunner } from "../transaction-runner";
import { KeyedMutex } from "./keyed-mutex";

// What the in-memory transaction runner needs from a domain's in-memory data access to roll it back.
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

/**
 * Behaves like TransactionRunner over an in-memory data access: it restores the state when the work throws,
 * runs afterCommit hooks only on success, joins when bound with within(tx), gives per-key locks held until
 * the outermost run ends.
 *
 * Runs share one state with no isolation: a run that throws restores the snapshot it took when it started,
 * which also undoes writes another run committed in the meantime. A test that overlaps runs must not rely
 * on one of them rolling back.
 */
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
        releases.push(await this.shared.mutex.acquire(key));
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
