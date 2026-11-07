import { AsyncLocalStorage } from "node:async_hooks";

import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { logger } from "@app/lib/logger";

import { PostgresStoreLocks, TStoreLocks } from "./store-locks";

declare const sealed: unique symbol;

export type TTransaction = {
  readonly [sealed]: true;
  afterCommit(fn: () => Promise<void>): void;
};

export type TRunContext<TStore> = { store: TStore; tx: TTransaction };

export type TTransactionRunner<TStore> = {
  run<T>(work: (ctx: TRunContext<TStore>) => Promise<T>): Promise<T>;
  within(tx: TTransaction): TTransactionRunner<TStore>;
};

export type TBuildStore<TStore> = (trx: Knex, locks: TStoreLocks) => TStore;

const knexHandles = new WeakMap<object, Knex.Transaction>();

export const sealTransaction = (
  trx: Knex.Transaction,
  afterCommit: (fn: () => Promise<void>) => void
): TTransaction => {
  const tx = { afterCommit } as unknown as TTransaction;
  knexHandles.set(tx, trx);
  return tx;
};

// Lint allows this only in data-access/, so nothing else can run SQL on another domain's transaction.
export const unsealTransaction = (tx: TTransaction): Knex.Transaction => {
  const trx = knexHandles.get(tx);
  if (!trx) throw new Error("Not a transaction issued by a TransactionRunner or sealKnexTransaction");
  return trx;
};

export const runAfterCommitHooks = async (hooks: Array<() => Promise<void>>) => {
  for (const hook of hooks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await hook();
    } catch (error) {
      // The logger is only initialised by the server; tests and scripts run without it.
      logger?.error(error, "afterCommit hook failed after the transaction committed");
    }
  }
};

// Marks the call chain inside a top-level run, so a second top-level run in it fails instead of quietly
// taking a second connection. `active` is cleared when the run settles, because work the run started and
// did not await keeps this context.
const activeRun = new AsyncLocalStorage<{ active: boolean }>();

export const assertNoActiveRun = () => {
  if (activeRun.getStore()?.active) {
    throw new Error(
      "A second top-level transaction was opened inside an active one. Pass the transaction with within(tx), or call the other domain before or after run."
    );
  }
};

export const withActiveRun = async <T>(work: () => Promise<T>): Promise<T> => {
  const marker = { active: true };
  try {
    return await activeRun.run(marker, work);
  } finally {
    marker.active = false;
  }
};

export class TransactionRunner<TStore> implements TTransactionRunner<TStore> {
  constructor(
    private readonly db: TDbClient,
    private readonly buildStore: TBuildStore<TStore>,
    private readonly parent?: TTransaction
  ) {}

  within(tx: TTransaction): TransactionRunner<TStore> {
    return new TransactionRunner(this.db, this.buildStore, tx);
  }

  async run<T>(work: (ctx: TRunContext<TStore>) => Promise<T>): Promise<T> {
    if (this.parent) {
      const trx = unsealTransaction(this.parent);
      return work({ store: this.buildStore(trx, new PostgresStoreLocks(trx)), tx: this.parent });
    }

    assertNoActiveRun();
    const hooks: Array<() => Promise<void>> = [];
    const result = await withActiveRun(() =>
      this.db.transaction(async (trx) => {
        const tx = sealTransaction(trx, (fn) => hooks.push(fn));
        return work({ store: this.buildStore(trx, new PostgresStoreLocks(trx)), tx });
      })
    );
    await runAfterCommitHooks(hooks);
    return result;
  }
}
