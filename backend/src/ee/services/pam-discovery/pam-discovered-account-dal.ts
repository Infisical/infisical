import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { sanitizeSqlLikeString } from "@app/lib/fn";
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

  const listStaged = async (
    discoverySourceId: string,
    { search, offset, limit }: { search?: string; offset?: number; limit?: number } = {}
  ) => {
    const baseQuery = db
      .replicaNode()(TableName.PamDiscoveredAccount)
      .where({ discoverySourceId })
      .whereNull("importedAccountId");
    if (search) void baseQuery.andWhere("name", "ilike", `%${sanitizeSqlLikeString(search)}%`);

    const countQuery = baseQuery.clone().clearSelect().count("id as count").first<{ count: string }>();

    const dataQuery = baseQuery.clone().orderBy("name", "asc");
    if (limit) void dataQuery.limit(limit);
    if (offset) void dataQuery.offset(offset);

    const [countResult, accounts] = await Promise.all([countQuery, dataQuery]);

    return { accounts, totalCount: Number(countResult?.count ?? 0) };
  };

  return { ...orm, upsertByFingerprint, listStaged };
};
