import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TDedicatedInstanceDALFactory = ReturnType<typeof dedicatedInstanceDALFactory>;

export const dedicatedInstanceDALFactory = (db: TDbClient) => {
  const dedicatedInstanceOrm = ormify(db, TableName.DedicatedInstances);

  const findInstancesByOrgId = async (orgId: string, tx?: Knex) => {
    try {
      const instances = await (tx || db.replicaNode())(TableName.DedicatedInstances)
        .where({ orgId })
        .select("*");
      return instances;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find instances by org ID" });
    }
  };

  return {
    ...dedicatedInstanceOrm,
    findInstancesByOrgId
  };
}; 