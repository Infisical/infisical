import { Knex } from "knex";

export const withTransaction = <K extends object>(db: Knex, dal: K) => ({
  transaction: async <T>(cb: (tx: Knex) => T) =>
    db.transaction(async (trx) => {
      const res = await cb(trx);
      return res;
    }),
  ...dal
});
