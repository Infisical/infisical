import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPamDiscoveredAccountDALFactory = ReturnType<typeof pamDiscoveredAccountDALFactory>;

export const pamDiscoveredAccountDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamDiscoveredAccount);

  const upsertByFingerprint = async (
    discoverySourceId: string,
    fingerprint: string,
    data: { accountType: string; name: string; encryptedDetails: Buffer },
    tx?: Knex
  ): Promise<{ isNew: boolean }> => {
    const existing = await (tx || db)(TableName.PamDiscoveredAccount).where({ discoverySourceId, fingerprint }).first();
    if (existing) {
      if (existing.importedAccountId) return { isNew: false };
      await (tx || db)(TableName.PamDiscoveredAccount).where({ id: existing.id }).update(data);
      return { isNew: false };
    }
    await (tx || db)(TableName.PamDiscoveredAccount).insert({ discoverySourceId, fingerprint, ...data });
    return { isNew: true };
  };

  const listStaged = async (discoverySourceId: string, search?: string) => {
    const query = db
      .replicaNode()(TableName.PamDiscoveredAccount)
      .where({ discoverySourceId })
      .whereNull("importedAccountId");
    if (search) void query.andWhere("name", "ilike", `%${search}%`);
    return query.orderBy("name", "asc");
  };

  return { ...orm, upsertByFingerprint, listStaged };
};
