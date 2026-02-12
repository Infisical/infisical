import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiDiscoveryConfigs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { PkiDiscoveryScanStatus } from "./pki-discovery-types";

export type TPkiDiscoveryConfigDALFactory = ReturnType<typeof pkiDiscoveryConfigDALFactory>;

export const pkiDiscoveryConfigDALFactory = (db: TDbClient) => {
  const pkiDiscoveryConfigOrm = ormify(db, TableName.PkiDiscoveryConfig);

  const findByProjectId = async (
    projectId: string,
    { offset = 0, limit = 25, search, tx }: { offset?: number; limit?: number; search?: string; tx?: Knex } = {}
  ) => {
    try {
      const knex = tx || db.replicaNode();

      let query = knex(TableName.PkiDiscoveryConfig)
        .select(`${TableName.PkiDiscoveryConfig}.*`)
        .select(
          knex.raw(`COALESCE((?), 0)::int as "certificatesFound"`, [
            knex(TableName.PkiDiscoveryScanHistory)
              .select("certificatesFoundCount")
              .where(
                `${TableName.PkiDiscoveryScanHistory}.discoveryConfigId`,
                knex.ref(`${TableName.PkiDiscoveryConfig}.id`)
              )
              .orderBy("createdAt", "desc")
              .limit(1)
          ])
        )
        .select(
          knex.raw(`COALESCE((?), 0)::int as "installationsFound"`, [
            knex(TableName.PkiDiscoveryScanHistory)
              .select("installationsFoundCount")
              .where(
                `${TableName.PkiDiscoveryScanHistory}.discoveryConfigId`,
                knex.ref(`${TableName.PkiDiscoveryConfig}.id`)
              )
              .orderBy("createdAt", "desc")
              .limit(1)
          ])
        )
        .where(`${TableName.PkiDiscoveryConfig}.projectId`, projectId)
        .orderBy(`${TableName.PkiDiscoveryConfig}.createdAt`, "desc")
        .offset(offset)
        .limit(limit);

      if (search) {
        query = query.andWhere((qb) => {
          void qb.whereILike("name", `%${search}%`).orWhereILike("description", `%${search}%`);
        });
      }

      const docs = await query;
      return docs as (TPkiDiscoveryConfigs & { certificatesFound: number; installationsFound: number })[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI discovery configs by project ID" });
    }
  };

  const countByProjectId = async (projectId: string, { search, tx }: { search?: string; tx?: Knex } = {}) => {
    try {
      let query = (tx || db.replicaNode())(TableName.PkiDiscoveryConfig).where({ projectId }).count("id").first();

      if (search) {
        query = query.andWhere((qb) => {
          void qb.whereILike("name", `%${search}%`).orWhereILike("description", `%${search}%`);
        });
      }

      const result = await query;
      return parseInt(String(result?.count || "0"), 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count PKI discovery configs by project ID" });
    }
  };

  const findDueForScan = async (tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.PkiDiscoveryConfig)
        .where({ isActive: true, isAutoScanEnabled: true })
        .whereNotNull("scanIntervalDays")
        .andWhere((qb) => {
          void qb
            .whereNull("lastScannedAt")
            .orWhereRaw(`"lastScannedAt" + ("scanIntervalDays" * interval '1 day') < NOW()`);
        });

      return docs as TPkiDiscoveryConfigs[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI discovery configs due for scan" });
    }
  };

  const findByIdWithInstallationCounts = async (id: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())<TPkiDiscoveryConfigs>(TableName.PkiDiscoveryConfig)
        .where({ id })
        .first();

      if (!doc) return null;

      const installationCount = await (tx || db.replicaNode())(TableName.PkiDiscoveryInstallation)
        .where({ discoveryId: id })
        .count("id")
        .first();

      return {
        ...doc,
        linkedInstallationsCount: parseInt(String(installationCount?.count || "0"), 10)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI discovery config by ID with counts" });
    }
  };

  const claimScanSlot = async (discoveryId: string, projectId: string, tx?: Knex) => {
    try {
      const result = await (tx || db)(TableName.PkiDiscoveryConfig)
        .where({ id: discoveryId })
        .whereNotExists(
          (tx || db)(TableName.PkiDiscoveryConfig)
            .select(db.raw("1"))
            .where({ projectId })
            .whereNot({ id: discoveryId })
            .whereIn("lastScanStatus", [PkiDiscoveryScanStatus.Running, PkiDiscoveryScanStatus.Pending])
        )
        .update({ lastScanStatus: PkiDiscoveryScanStatus.Pending })
        .returning("*");

      return result[0] ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Claim PKI discovery scan slot" });
    }
  };

  const findByName = async (projectId: string, name: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.PkiDiscoveryConfig).where({ projectId, name }).first();

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI discovery config by name" });
    }
  };

  return {
    ...pkiDiscoveryConfigOrm,
    findByProjectId,
    countByProjectId,
    findDueForScan,
    findByIdWithInstallationCounts,
    findByName,
    claimScanSlot
  };
};
