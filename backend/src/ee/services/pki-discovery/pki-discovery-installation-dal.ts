import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiDiscoveryInstallations } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPkiDiscoveryInstallationDALFactory = ReturnType<typeof pkiDiscoveryInstallationDALFactory>;

export const pkiDiscoveryInstallationDALFactory = (db: TDbClient) => {
  const pkiDiscoveryInstallationOrm = ormify(db, TableName.PkiDiscoveryInstallation);

  const findByDiscoveryId = async (discoveryId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.PkiDiscoveryInstallation)
        .where({ discoveryId })
        .orderBy("lastScannedAt", "desc");

      return docs as TPkiDiscoveryInstallations[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI discovery installations by discovery ID" });
    }
  };

  const upsertLink = async (
    discoveryId: string,
    installationId: string,
    lastScannedAt: Date,
    tx?: Knex
  ): Promise<TPkiDiscoveryInstallations | null> => {
    try {
      const [row] = await (tx || db)(TableName.PkiDiscoveryInstallation)
        .insert({ discoveryId, installationId, lastScannedAt })
        .onConflict(["discoveryId", "installationId"])
        .merge({ lastScannedAt })
        .returning("*");

      return row;
    } catch (error) {
      // 23503 = FK violation — the installation was deleted concurrently
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23503") {
        return null;
      }
      throw new DatabaseError({ error, name: "Upsert PKI discovery installation link" });
    }
  };

  return {
    ...pkiDiscoveryInstallationOrm,
    findByDiscoveryId,
    upsertLink
  };
};
