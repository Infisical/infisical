import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

import { PamDiscoverySchedule } from "./pam-discovery-enums";

export type TPamDiscoverySourceDALFactory = ReturnType<typeof pamDiscoverySourceDALFactory>;

export const pamDiscoverySourceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamDiscoverySource);

  const findScheduled = async () =>
    db
      .replicaNode()(TableName.PamDiscoverySource)
      .whereIn("schedule", [PamDiscoverySchedule.Daily, PamDiscoverySchedule.Weekly]);

  return { ...orm, findScheduled };
};
