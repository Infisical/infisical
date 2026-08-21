import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TKmsKekHistoryDALFactory = ReturnType<typeof kmsKekHistoryDALFactory>;

export const kmsKekHistoryDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.KmsKekHistory);

  // Outlives the ciphertext it describes and is never pruned: it is how a restored dump is matched to
  // an archived key.
  const findHistory = async (tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.KmsKekHistory).select("*").orderBy("activatedAt", "desc");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find kek history" });
    }
  };

  const findCurrent = async (tx?: Knex) => {
    try {
      return await (tx || db)(TableName.KmsKekHistory)
        .whereNull("supersededAt")
        .orderBy("activatedAt", "desc")
        .first("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find current kek history" });
    }
  };

  return { ...orm, findHistory, findCurrent };
};
