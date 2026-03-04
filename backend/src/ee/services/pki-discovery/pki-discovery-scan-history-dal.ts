import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiDiscoveryScanHistory } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPkiDiscoveryScanHistoryDALFactory = ReturnType<typeof pkiDiscoveryScanHistoryDALFactory>;

export const pkiDiscoveryScanHistoryDALFactory = (db: TDbClient) => {
  const pkiDiscoveryScanHistoryOrm = ormify(db, TableName.PkiDiscoveryScanHistory);

  const findLatestByDiscoveryId = async (discoveryConfigId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.PkiDiscoveryScanHistory)
        .where({ discoveryConfigId })
        .orderBy("startedAt", "desc")
        .first();

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find latest PKI discovery scan history by discovery ID" });
    }
  };

  const findByDiscoveryId = async (
    discoveryConfigId: string,
    { offset = 0, limit = 25, tx }: { offset?: number; limit?: number; tx?: Knex } = {}
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.PkiDiscoveryScanHistory)
        .where({ discoveryConfigId })
        .orderBy("startedAt", "desc")
        .offset(offset)
        .limit(limit);

      return docs as TPkiDiscoveryScanHistory[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI discovery scan history by discovery ID" });
    }
  };

  const countByDiscoveryId = async (discoveryConfigId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.PkiDiscoveryScanHistory)
        .where({ discoveryConfigId })
        .count("id")
        .first();

      return parseInt(String(result?.count || "0"), 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count PKI discovery scan history by discovery ID" });
    }
  };

  return {
    ...pkiDiscoveryScanHistoryOrm,
    findLatestByDiscoveryId,
    findByDiscoveryId,
    countByDiscoveryId
  };
};
