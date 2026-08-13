import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TEndpointTargetAssignmentDALFactory = ReturnType<typeof endpointTargetAssignmentDALFactory>;

export const endpointTargetAssignmentDALFactory = (db: TDbClient) => {
  const assignmentOrm = ormify(db, TableName.EndpointTargetAssignment);

  // The console renders "who can reach this" as device names, so the join happens here rather than
  // sending the page a list of uuids to resolve one by one.
  const findByTargetIdsWithDevice = async (targetIds: string[], tx?: Knex) => {
    if (!targetIds.length) return [];

    try {
      return await (tx || db.replicaNode())(TableName.EndpointTargetAssignment)
        .join(
          TableName.EndpointDevice,
          `${TableName.EndpointDevice}.id`,
          `${TableName.EndpointTargetAssignment}.deviceId`
        )
        .whereIn(`${TableName.EndpointTargetAssignment}.targetId`, targetIds)
        .select(selectAllTableCols(TableName.EndpointTargetAssignment))
        .select(db.ref("name").withSchema(TableName.EndpointDevice).as("deviceName"));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint target assignments by target" });
    }
  };

  // Granting access a device already has is the same state, not a conflict, so a repeated click is
  // ignored rather than raising the unique violation as a 500.
  const grantIfAbsent = async ({ targetId, deviceId }: { targetId: string; deviceId: string }, tx?: Knex) => {
    try {
      await (tx || db)(TableName.EndpointTargetAssignment)
        .insert({ targetId, deviceId })
        .onConflict(["targetId", "deviceId"])
        .ignore();
    } catch (error) {
      throw new DatabaseError({ error, name: "Grant endpoint target access" });
    }
  };

  return { ...assignmentOrm, findByTargetIdsWithDevice, grantIfAbsent };
};
