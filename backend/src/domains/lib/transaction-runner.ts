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
  if (!trx) throw new Error("Not a transaction issued by a TransactionRunner");
  return trx;
};

// logger is optional: only the server initialises it, tests and scripts run without it.
export const runAfterCommitHooks = async (hooks: Array<() => Promise<void>>) => {
  for (const hook of hooks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await hook();
    } catch (error) {
      logger?.error(error, "afterCommit hook failed after the transaction committed");
    }
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

    const hooks: Array<() => Promise<void>> = [];
    const result = await this.db.transaction(async (trx) => {
      const tx = sealTransaction(trx, (fn) => hooks.push(fn));
      return work({ store: this.buildStore(trx, new PostgresStoreLocks(trx)), tx });
    });
    await runAfterCommitHooks(hooks);
    return result;
  }
}
