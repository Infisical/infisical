import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPamResourceRotationRulesDALFactory = ReturnType<typeof pamResourceRotationRulesDALFactory>;

export const pamResourceRotationRulesDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamResourceRotationRule);

  const findByResourceId = async (resourceId: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.PamResourceRotationRule)
        .where({ resourceId })
        .orderBy("priority", "asc")
        .select("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find rotation rules by resource ID" });
    }
  };

  const findByResourceIds = async (resourceIds: string[], tx?: Knex) => {
    try {
      if (!resourceIds.length) return [];

      return await (tx || db.replicaNode())(TableName.PamResourceRotationRule)
        .whereIn("resourceId", resourceIds)
        .orderBy("priority", "asc")
        .select("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find rotation rules by resource IDs" });
    }
  };

  const getMaxPriority = async (resourceId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.PamResourceRotationRule)
        .where({ resourceId })
        .max("priority as maxPriority")
        .first();

      return Number((result as { maxPriority?: number | null })?.maxPriority) || 0;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get max rotation rule priority" });
    }
  };

  return {
    ...orm,
    findByResourceId,
    findByResourceIds,
    getMaxPriority
  };
};
