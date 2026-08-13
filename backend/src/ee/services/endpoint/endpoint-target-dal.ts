import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TEndpointTargetDALFactory = ReturnType<typeof endpointTargetDALFactory>;

export const endpointTargetDALFactory = (db: TDbClient) => {
  const targetOrm = ormify(db, TableName.EndpointTarget);

  // The console list needs each target's gateway by name, not by id: an admin picks a gateway by
  // name and has no way to recognise a uuid.
  const findByProjectWithGateway = async (projectId: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.EndpointTarget)
        .leftJoin(TableName.GatewayV2, `${TableName.GatewayV2}.id`, `${TableName.EndpointTarget}.gatewayId`)
        .where(`${TableName.EndpointTarget}.projectId`, projectId)
        .orderBy(`${TableName.EndpointTarget}.createdAt`, "desc")
        .select(selectAllTableCols(TableName.EndpointTarget))
        .select(db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint targets by project" });
    }
  };

  // What the agent's config pull resolves to: every enabled target this one device has been granted.
  // A target with no gateway is left out rather than sent — the device could not dial it, and a
  // listener that always fails is worse than no listener at all.
  const findAssignedToDevice = async (deviceId: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.EndpointTargetAssignment)
        .join(
          TableName.EndpointTarget,
          `${TableName.EndpointTarget}.id`,
          `${TableName.EndpointTargetAssignment}.targetId`
        )
        .where(`${TableName.EndpointTargetAssignment}.deviceId`, deviceId)
        .where(`${TableName.EndpointTarget}.isEnabled`, true)
        .whereNotNull(`${TableName.EndpointTarget}.gatewayId`)
        .orderBy(`${TableName.EndpointTarget}.createdAt`, "asc")
        .select(selectAllTableCols(TableName.EndpointTarget));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint targets assigned to device" });
    }
  };

  // The connect route's authorization check and its routing lookup are the same question — "may this
  // device reach this target, and where does the gateway dial?" — so they are one query. A device
  // that is not assigned gets no row, and the route 404s without revealing that the target exists.
  const findAssignedToDeviceById = async ({ deviceId, targetId }: { deviceId: string; targetId: string }, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.EndpointTargetAssignment)
        .join(
          TableName.EndpointTarget,
          `${TableName.EndpointTarget}.id`,
          `${TableName.EndpointTargetAssignment}.targetId`
        )
        .where(`${TableName.EndpointTargetAssignment}.deviceId`, deviceId)
        .where(`${TableName.EndpointTarget}.id`, targetId)
        .select(selectAllTableCols(TableName.EndpointTarget))
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find assigned endpoint target by id" });
    }
  };

  return { ...targetOrm, findByProjectWithGateway, findAssignedToDevice, findAssignedToDeviceById };
};
