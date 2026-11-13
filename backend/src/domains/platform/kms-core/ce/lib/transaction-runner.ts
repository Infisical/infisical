import { Knex } from "knex";

import { logger } from "@app/lib/logger";

import { DataAccessDb } from "./data-access-db";
import { PostgresDataAccessLocks, TDataAccessLocks } from "./data-access-locks";

declare const sealed: unique symbol;

export type TTransaction = {
  readonly [sealed]: true;
  afterCommit(fn: () => Promise<void>): void;
};

export type TRunContext<TDataAccess> = { dataAccess: TDataAccess; tx: TTransaction };

export type TTransactionRunner<TDataAccess> = {
  run<T>(work: (ctx: TRunContext<TDataAccess>) => Promise<T>): Promise<T>;
  within(tx: TTransaction): TTransactionRunner<TDataAccess>;
};

// Inside a transaction db is DataAccessDb.single(trx): every read and write runs on the transaction.
export type TBuildDataAccess<TDataAccess> = (db: DataAccessDb, locks: TDataAccessLocks) => TDataAccess;

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

export class TransactionRunner<TDataAccess> implements TTransactionRunner<TDataAccess> {
  constructor(
    private readonly db: DataAccessDb,
    private readonly buildDataAccess: TBuildDataAccess<TDataAccess>,
    private readonly parent?: TTransaction
  ) {}

  within(tx: TTransaction): TransactionRunner<TDataAccess> {
    return new TransactionRunner(this.db, this.buildDataAccess, tx);
  }

  async run<T>(work: (ctx: TRunContext<TDataAccess>) => Promise<T>): Promise<T> {
    if (this.parent) {
      const trx = unsealTransaction(this.parent);
      return work({ dataAccess: this.inTransaction(trx), tx: this.parent });
    }

    const hooks: Array<() => Promise<void>> = [];
    const result = await this.db.writer().transaction(async (trx) => {
      const tx = sealTransaction(trx, (fn) => hooks.push(fn));
      return work({ dataAccess: this.inTransaction(trx), tx });
    });
    await runAfterCommitHooks(hooks);
    return result;
  }

  private inTransaction(trx: Knex.Transaction): TDataAccess {
    return this.buildDataAccess(DataAccessDb.single(trx), new PostgresDataAccessLocks(trx));
  }
}
