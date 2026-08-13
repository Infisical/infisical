import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TEndpointDeviceDALFactory = ReturnType<typeof endpointDeviceDALFactory>;

export type TEndpointDeviceSystemInfo = {
  hostname?: string | null;
  platform?: string | null;
  arch?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  osBuild?: string | null;
  modelIdentifier?: string | null;
  cpuModel?: string | null;
  cpuCores?: number | null;
  memoryBytes?: number | null;
  serialNumber?: string | null;
  ipAddress?: string | null;
  bootedAt?: Date | null;
  systemInfoReportedAt: Date;
};

export const endpointDeviceDALFactory = (db: TDbClient) => {
  const deviceOrm = ormify(db, TableName.EndpointDevice);

  const findByProjectWithOwner = async (projectId: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.EndpointDevice)
        .join(TableName.Users, `${TableName.Users}.id`, `${TableName.EndpointDevice}.userId`)
        .where(`${TableName.EndpointDevice}.projectId`, projectId)
        .orderBy(`${TableName.EndpointDevice}.createdAt`, "desc")
        .select(selectAllTableCols(TableName.EndpointDevice))
        .select(
          db.ref("email").withSchema(TableName.Users).as("userEmail"),
          db.ref("username").withSchema(TableName.Users).as("username"),
          db.ref("firstName").withSchema(TableName.Users).as("userFirstName"),
          db.ref("lastName").withSchema(TableName.Users).as("userLastName")
        );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint devices by project" });
    }
  };

  // Single statement so a policy write never holds a transaction open across the fleet.
  const bumpConfigVersionForProject = async (projectId: string, tx?: Knex) => {
    try {
      await (tx || db)(TableName.EndpointDevice).where({ projectId }).increment("configVersion", 1);
    } catch (error) {
      throw new DatabaseError({ error, name: "Bump endpoint device config version" });
    }
  };

  const stampHeartbeat = async (
    deviceId: string,
    data: {
      lastSeenAt: Date;
      agentVersion: string;
      pfEnabled: boolean;
      blockedAddresses: string[];
      // Carried on the same UPDATE rather than a second one, because the heartbeat is the highest
      // frequency write in the product and this arrives inside it.
      systemInfo?: TEndpointDeviceSystemInfo;
    },
    tx?: Knex
  ) => {
    try {
      const [device] = await (tx || db)(TableName.EndpointDevice)
        .where({ id: deviceId })
        .update({
          lastSeenAt: data.lastSeenAt,
          agentVersion: data.agentVersion,
          pfEnabled: data.pfEnabled,
          blockedAddresses: JSON.stringify(data.blockedAddresses),
          ...(data.systemInfo ?? {})
        })
        .returning("*");

      return device;
    } catch (error) {
      throw new DatabaseError({ error, name: "Stamp endpoint device heartbeat" });
    }
  };

  return { ...deviceOrm, findByProjectWithOwner, bumpConfigVersionForProject, stampHeartbeat };
};
