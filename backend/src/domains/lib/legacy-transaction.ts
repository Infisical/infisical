import { Knex } from "knex";

import { runAfterCommitHooks, sealTransaction, TTransaction } from "./transaction-runner";

// Lets code under src/services/ that already holds a Knex transaction join a domain call while it moves to
// a domain. afterCommit hooks run once that transaction commits, and never if it rolls back.
export const sealKnexTransaction = (trx: Knex): TTransaction => {
  const knexTrx = trx as Knex.Transaction;
  if (!("executionPromise" in knexTrx)) {
    throw new Error("sealKnexTransaction needs a Knex transaction, not the connection pool");
  }
  const hooks: Array<() => Promise<void>> = [];
  knexTrx.executionPromise.then(
    () => runAfterCommitHooks(hooks),
    () => undefined
  );
  return sealTransaction(knexTrx, (fn) => hooks.push(fn));
};
