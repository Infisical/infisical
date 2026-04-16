import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TScepDynamicChallengeDALFactory = ReturnType<typeof scepDynamicChallengeDALFactory>;

export const scepDynamicChallengeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PkiScepDynamicChallenge);

  const consumeByHash = async (hashedChallenge: string, scepConfigId: string, tx?: Knex) => {
    try {
      const [result] = await (tx || db)(TableName.PkiScepDynamicChallenge)
        .where({ hashedChallenge, scepConfigId })
        .where("expiresAt", ">", new Date())
        .delete()
        .returning("*");

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Consume SCEP dynamic challenge by hash" });
    }
  };

  const countPending = async (scepConfigId: string, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiScepDynamicChallenge)
        .where({ scepConfigId })
        .where("expiresAt", ">", new Date())
        .count("id as count")
        .first();

      return Number((result as { count?: string | number })?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count pending SCEP dynamic challenges" });
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

  const deleteByConfigId = async (scepConfigId: string, tx?: Knex) => {
    try {
      const deletedCount = await (tx || db)(TableName.PkiScepDynamicChallenge).where({ scepConfigId }).delete();

      return deletedCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete SCEP dynamic challenges by config" });
    }
  };

  return {
    ...orm,
    consumeByHash,
    countPending,
    pruneExpired,
    deleteByConfigId
  };
};
