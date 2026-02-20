import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPamDiscoveryRuns } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TPamDiscoveryRunDALFactory = ReturnType<typeof pamDiscoveryRunDALFactory>;

export const pamDiscoveryRunDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamDiscoveryRun);

  const findByDiscoverySourceId = async (
    discoverySourceId: string,
    { offset = 0, limit = 25, tx }: { offset?: number; limit?: number; tx?: Knex } = {}
  ) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const query = dbInstance(TableName.PamDiscoveryRun).where({ discoverySourceId });

      const countQuery = query.clone().count("*", { as: "count" }).first();

      void query.select(selectAllTableCols(TableName.PamDiscoveryRun));

      void query.orderBy("createdAt", "desc");

      if (typeof limit === "number") {
        void query.limit(limit).offset(offset);
      }

      const [runs, countResult] = await Promise.all([query, countQuery]);
      const totalCount = Number(countResult?.count || 0);

      return { runs, totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM discovery runs by source ID" });
    }
  };

  const findLatestBySourceId = async (discoverySourceId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.PamDiscoveryRun)
        .where({ discoverySourceId })
        .orderBy("createdAt", "desc")
        .first();

      return (doc as TPamDiscoveryRuns) || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find latest PAM discovery run by source ID" });
    }
  };

  return {
    ...orm,
    findByDiscoverySourceId,
    findLatestBySourceId
  };
};
