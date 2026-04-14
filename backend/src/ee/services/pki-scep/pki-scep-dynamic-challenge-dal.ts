import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TScepDynamicChallengeDALFactory = ReturnType<typeof scepDynamicChallengeDALFactory>;

export const scepDynamicChallengeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PkiScepDynamicChallenge);

  const findUnusedByConfigId = async (scepConfigId: string, tx?: Knex) => {
    try {
      const results = await (tx || db.replicaNode())(TableName.PkiScepDynamicChallenge)
        .where({ scepConfigId })
        .whereNull("usedAt")
        .where("expiresAt", ">", new Date());

      return results;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find unused SCEP dynamic challenges" });
    }
  };

  const countPending = async (scepConfigId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.PkiScepDynamicChallenge)
        .where({ scepConfigId })
        .whereNull("usedAt")
        .where("expiresAt", ">", new Date())
        .count("id as count")
        .first();

      return Number((result as { count?: string | number })?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count pending SCEP dynamic challenges" });
    }
  };

  const markUsed = async (id: string, tx?: Knex) => {
    try {
      const [result] = await (tx || db)(TableName.PkiScepDynamicChallenge)
        .where({ id })
        .whereNull("usedAt")
        .update({ usedAt: new Date() })
        .returning("*");

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Mark SCEP dynamic challenge as used" });
    }
  };

  const pruneExpired = async (scepConfigId: string, tx?: Knex) => {
    try {
      const deletedCount = await (tx || db)(TableName.PkiScepDynamicChallenge)
        .where({ scepConfigId })
        .where("expiresAt", "<", new Date())
        .delete();

      return deletedCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "Prune expired SCEP dynamic challenges" });
    }
  };

  return {
    ...orm,
    findUnusedByConfigId,
    countPending,
    markUsed,
    pruneExpired
  };
};
