import { Knex } from "knex";

import { sealTransaction, TTransaction } from "./transaction-runner";

// Lets code under src/services/ that holds a Knex transaction join a domain's unit of work, so a check and the
// write it guards share one connection and one lock (see ../AGENTS.md, "Sharing a transaction").
// afterCommit throws: on a nested Knex transaction the commit we could observe is a savepoint release, so the
// legacy caller runs its follow-ups after its own commit instead.
export const sealKnexTransaction = (trx: Knex): TTransaction => {
  const knexTrx = trx as Knex.Transaction;
  if (!("executionPromise" in knexTrx)) {
    throw new Error("sealKnexTransaction needs a Knex transaction, not the connection pool");
  }
  return sealTransaction(knexTrx, () => {
    throw new Error("afterCommit is not available on a legacy transaction; run it after the caller commits");
  });
};
