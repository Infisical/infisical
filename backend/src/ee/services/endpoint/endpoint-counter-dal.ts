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
        .orderBy(`${TableName.EndpointCounter}.reportedAt`, "desc")
        .select(selectAllTableCols(TableName.EndpointCounter))
        .select(
          db.ref("name").withSchema(TableName.EndpointDevice).as("deviceName"),
          db.ref("name").withSchema(TableName.EndpointNetworkRule).as("ruleName"),
          db.ref("destination").withSchema(TableName.EndpointNetworkRule).as("ruleDestination")
        );

      if (deviceId) {
        void query.andWhere(`${TableName.EndpointCounter}.deviceId`, deviceId);
      }

      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint counters by project" });
    }
  };

  return { ...counterOrm, findByProject };
};
