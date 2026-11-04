import { TDbClient } from "@app/db";

export interface TTransactionRunner<TDataAccess> {
  run<T>(work: (dataAccess: TDataAccess) => Promise<T>): Promise<T>;
}

export class TransactionRunner<TDataAccess> implements TTransactionRunner<TDataAccess> {
  constructor(
    private readonly db: TDbClient,
    private readonly buildDataAccess: (db: TDbClient) => TDataAccess
  ) {}

  run<T>(work: (dataAccess: TDataAccess) => Promise<T>) {
    return this.db.transaction((trx) => work(this.buildDataAccess(trx)));
  }
}
