import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type THsmConnectorDALFactory = ReturnType<typeof hsmConnectorDALFactory>;

export const hsmConnectorDALFactory = (db: TDbClient) => {
  const hsmConnectorOrm = ormify(db, TableName.HsmConnector);

  const countReferencingCertificates = async (connectorId: string, tx?: Knex): Promise<number> => {
    try {
      const result = await (tx || db)(TableName.Certificate)
        .where("hsmConnectorId", connectorId)
        .count<{ count: string }[]>("id as count")
        .first();
      return Number(result?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "HsmConnectorDAL.countReferencingCertificates" });
    }
  };

  const findByProjectId = async (projectId: string) => {
    try {
      return await db
        .replicaNode()(TableName.HsmConnector)
        .where("projectId", projectId)
        .select(selectAllTableCols(TableName.HsmConnector))
        .orderBy("createdAt", "desc");
    } catch (error) {
      throw new DatabaseError({ error, name: "HsmConnectorDAL.findByProjectId" });
    }
  };

  const listLinkedResources = async (connectorId: string, { offset, limit }: { offset: number; limit: number }) => {
    try {
      const baseQuery = db.replicaNode()(TableName.Certificate).where("hsmConnectorId", connectorId);

      const [rows, totalCountResult] = await Promise.all([
        baseQuery
          .clone()
          .select("id", "commonName", "status", "notAfter", "hsmKeyLabel", "createdAt")
          .orderBy("createdAt", "desc")
          .limit(limit)
          .offset(offset),
        baseQuery.clone().count<{ count: string }[]>("id as count").first()
      ]);

      return {
        certificates: rows.map((r) => ({
          id: r.id,
          commonName: r.commonName,
          status: r.status,
          notAfter: r.notAfter,
          hsmKeyLabel: (r.hsmKeyLabel as string | null) ?? null,
          createdAt: r.createdAt
        })),
        totalCount: Number(totalCountResult?.count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "HsmConnectorDAL.listLinkedResources" });
    }
  };

  return {
    ...hsmConnectorOrm,
    countReferencingCertificates,
    findByProjectId,
    listLinkedResources
  };
};
