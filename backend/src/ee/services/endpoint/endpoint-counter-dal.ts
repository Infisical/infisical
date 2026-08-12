import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TEndpointCounterDALFactory = ReturnType<typeof endpointCounterDALFactory>;

export const endpointCounterDALFactory = (db: TDbClient) => {
  const counterOrm = ormify(db, TableName.EndpointCounter);

  // Counters carry no projectId of their own, so scoping goes through the device that reported
  // them. The rule join is what lets the console label a counter with the rule the admin wrote
  // rather than a bare id.
  const findByProject = async ({ projectId, deviceId }: { projectId: string; deviceId?: string }, tx?: Knex) => {
    try {
      const query = (tx || db.replicaNode())(TableName.EndpointCounter)
        .join(TableName.EndpointDevice, `${TableName.EndpointDevice}.id`, `${TableName.EndpointCounter}.deviceId`)
        .join(
          TableName.EndpointNetworkRule,
          `${TableName.EndpointNetworkRule}.id`,
          `${TableName.EndpointCounter}.networkRuleId`
        )
        .where(`${TableName.EndpointDevice}.projectId`, projectId)
        // Heaviest transfer first: every counter in a report shares a reportedAt, so the byte count
        // is the only ordering that tells the reader anything.
        .orderBy(`${TableName.EndpointCounter}.bytesOut`, "desc")
        .select(selectAllTableCols(TableName.EndpointCounter))
        .select(
          db.ref("name").withSchema(TableName.EndpointDevice).as("deviceName"),
          db.ref("name").withSchema(TableName.EndpointNetworkRule).as("ruleName"),
          // The window makes the counter readable: 100 MB means nothing without "per minute".
          db.ref("windowSeconds").withSchema(TableName.EndpointNetworkRule).as("ruleWindowSeconds")
        );

      if (deviceId) {
        void query.andWhere(`${TableName.EndpointCounter}.deviceId`, deviceId);
      }

      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint counters by project" });
    }
  };

  // A volume rule's destinations come and go with the device's traffic, so the console has to be able
  // to lose one. Every counter in a report carries the same reportedAt, which makes "older than this
  // report" the whole set the agent no longer measures — no need to send the survivors back as a list.
  const deleteReportedBefore = async ({ deviceId, reportedAt }: { deviceId: string; reportedAt: Date }, tx?: Knex) => {
    try {
      return await (tx || db)(TableName.EndpointCounter).where({ deviceId }).andWhere("reportedAt", "<", reportedAt).del();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete stale endpoint counters" });
    }
  };

  return { ...counterOrm, findByProject, deleteReportedBefore };
};
