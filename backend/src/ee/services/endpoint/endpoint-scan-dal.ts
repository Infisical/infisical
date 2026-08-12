import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { EndpointSecretFindingStatus } from "./endpoint-scan-enums";

export type TEndpointScanPolicyDALFactory = ReturnType<typeof endpointScanPolicyDALFactory>;
export type TEndpointDeviceScanDALFactory = ReturnType<typeof endpointDeviceScanDALFactory>;
export type TEndpointSecretFindingDALFactory = ReturnType<typeof endpointSecretFindingDALFactory>;

export const endpointScanPolicyDALFactory = (db: TDbClient) => ormify(db, TableName.EndpointScanPolicy);

export const endpointDeviceScanDALFactory = (db: TDbClient) => {
  const scanOrm = ormify(db, TableName.EndpointDeviceScan);

  // A device scan row carries no projectId of its own, so scoping goes through the device, exactly as
  // counters do. The join also gives the console the device name without a second query.
  const findByProject = async ({ projectId }: { projectId: string }, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.EndpointDeviceScan)
        .join(
          TableName.EndpointDevice,
          `${TableName.EndpointDevice}.id`,
          `${TableName.EndpointDeviceScan}.deviceId`
        )
        .where(`${TableName.EndpointDevice}.projectId`, projectId)
        .select(selectAllTableCols(TableName.EndpointDeviceScan))
        .select(db.ref("name").withSchema(TableName.EndpointDevice).as("deviceName"));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint device scans by project" });
    }
  };

  return { ...scanOrm, findByProject };
};

export const endpointSecretFindingDALFactory = (db: TDbClient) => {
  const findingOrm = ormify(db, TableName.EndpointSecretFinding);

  const findByProject = async ({ projectId, deviceId }: { projectId: string; deviceId?: string }, tx?: Knex) => {
    try {
      const query = (tx || db.replicaNode())(TableName.EndpointSecretFinding)
        .join(
          TableName.EndpointDevice,
          `${TableName.EndpointDevice}.id`,
          `${TableName.EndpointSecretFinding}.deviceId`
        )
        .where(`${TableName.EndpointSecretFinding}.projectId`, projectId)
        // Open before resolved, then newest first: a credential that is still sitting on a device is
        // the only thing an admin can act on.
        .orderBy(`${TableName.EndpointSecretFinding}.status`, "asc")
        .orderBy(`${TableName.EndpointSecretFinding}.lastSeenAt`, "desc")
        .select(selectAllTableCols(TableName.EndpointSecretFinding))
        .select(db.ref("name").withSchema(TableName.EndpointDevice).as("deviceName"));

      if (deviceId) {
        void query.andWhere(`${TableName.EndpointSecretFinding}.deviceId`, deviceId);
      }

      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint secret findings by project" });
    }
  };

  // Anything the newest scan did not report is no longer on the device, so it resolves itself.
  //
  // Scoped to the roots that scan actually read, which matters more than it looks: a scan whose roots
  // macOS refused to open reports nothing from them, and without this scoping that would silently
  // resolve every finding the device had.
  const resolveMissingUnderRoots = async (
    {
      deviceId,
      scanStartedAt,
      roots
    }: {
      deviceId: string;
      scanStartedAt: Date;
      roots: string[];
    },
    tx?: Knex
  ) => {
    if (!roots.length) return 0;

    try {
      return await (tx || db)(TableName.EndpointSecretFinding)
        .where({ deviceId, status: EndpointSecretFindingStatus.Open })
        .andWhere("lastSeenAt", "<", scanStartedAt)
        .andWhere((builder) => {
          roots.forEach((root) => {
            void builder.orWhere("file", "like", `${root}%`);
          });
        })
        .update({ status: EndpointSecretFindingStatus.Resolved });
    } catch (error) {
      throw new DatabaseError({ error, name: "Resolve missing endpoint secret findings" });
    }
  };

  return { ...findingOrm, findByProject, resolveMissingUnderRoots };
};
