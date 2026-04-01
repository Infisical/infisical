import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TScepTransactionDALFactory = ReturnType<typeof scepTransactionDALFactory>;

export const scepTransactionDALFactory = (db: TDbClient) => {
  const scepTransactionOrm = ormify(db, TableName.PkiScepTransaction);

  const findByProfileAndTransactionId = async (profileId: string, transactionId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.PkiScepTransaction)
        .where({ profileId, transactionId })
        .first();

      return result || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find SCEP transaction by profileId and transactionId" });
    }
  };

  const pruneExpiredTransactions = async (tx?: Knex) => {
    try {
      const deletedCount = await (tx || db)(TableName.PkiScepTransaction).where("expiresAt", "<", new Date()).delete();

      return deletedCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "Prune expired SCEP transactions" });
    }
  };

  return {
    ...scepTransactionOrm,
    findByProfileAndTransactionId,
    pruneExpiredTransactions
  };
};
