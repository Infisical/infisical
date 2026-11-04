import { TTransactionRunner } from "../transaction-runner";

export class InMemoryTransactionRunner<TDataAccess> implements TTransactionRunner<TDataAccess> {
  constructor(private readonly dataAccess: TDataAccess) {}

  run<T>(work: (dataAccess: TDataAccess) => Promise<T>) {
    return work(this.dataAccess);
  }
}
