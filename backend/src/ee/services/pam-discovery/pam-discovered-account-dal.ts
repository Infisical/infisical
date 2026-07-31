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
    const seen = { lastDiscoveredAt: new Date(), isStale: false };
    const existing = await (tx || db)(TableName.PamDiscoveredAccount).where({ discoverySourceId, fingerprint }).first();
    if (existing) {
      const update = existing.importedAccountId ? seen : { ...data, ...seen };
      await (tx || db)(TableName.PamDiscoveredAccount).where({ id: existing.id }).update(update);
      return { isNew: false };
    }
    await (tx || db)(TableName.PamDiscoveredAccount).insert({ discoverySourceId, fingerprint, ...data, ...seen });
    return { isNew: true };
  };

  const listStaged = async (
    discoverySourceId: string,
    { search, offset, limit }: { search?: string; offset?: number; limit?: number } = {}
  ) => {
    const baseQuery = db
      .replicaNode()(TableName.PamDiscoveredAccount)
      .where({ discoverySourceId })
      .whereNull("importedAccountId")
      .where("isStale", false);
    if (search) void baseQuery.andWhere("name", "ilike", `%${sanitizeSqlLikeString(search)}%`);

    const countQuery = baseQuery.clone().clearSelect().count("id as count").first<{ count: string }>();

    const dataQuery = baseQuery.clone().orderBy("name", "asc");
    if (limit) void dataQuery.limit(limit);
    if (offset) void dataQuery.offset(offset);

    const [countResult, accounts] = await Promise.all([countQuery, dataQuery]);

    return { accounts, totalCount: Number(countResult?.count ?? 0) };
  };

  // Imported accounts this source no longer finds in the environment, joined to the managed account for its
  // current name/folder (the review surface for blocked accounts). Staged rows are never stale (they're deleted).
  const listStale = async (
    discoverySourceId: string,
    { search, offset, limit }: { search?: string; offset?: number; limit?: number } = {}
  ) => {
    const baseQuery = db
      .replicaNode()(TableName.PamDiscoveredAccount)
      .where(`${TableName.PamDiscoveredAccount}.discoverySourceId`, discoverySourceId)
      .where(`${TableName.PamDiscoveredAccount}.isStale`, true)
      .whereNotNull(`${TableName.PamDiscoveredAccount}.importedAccountId`)
      .join(TableName.PamAccount, `${TableName.PamDiscoveredAccount}.importedAccountId`, `${TableName.PamAccount}.id`)
      .leftJoin(TableName.PamFolder, `${TableName.PamAccount}.folderId`, `${TableName.PamFolder}.id`);
    if (search) void baseQuery.andWhere(`${TableName.PamAccount}.name`, "ilike", `%${sanitizeSqlLikeString(search)}%`);

    const countQuery = baseQuery
      .clone()
      .clearSelect()
      .count(`${TableName.PamDiscoveredAccount}.id as count`)
      .first<{ count: string }>();

    const dataQuery = baseQuery
      .clone()
      .select(
        `${TableName.PamDiscoveredAccount}.id`,
        `${TableName.PamDiscoveredAccount}.accountType`,
        `${TableName.PamDiscoveredAccount}.lastDiscoveredAt`,
        `${TableName.PamDiscoveredAccount}.importedAccountId`,
        `${TableName.PamAccount}.name as accountName`,
        `${TableName.PamAccount}.folderId`,
        `${TableName.PamFolder}.name as folderName`
      )
      .orderBy(`${TableName.PamAccount}.name`, "asc");
    if (limit) void dataQuery.limit(limit);
    if (offset) void dataQuery.offset(offset);

    const [countResult, accounts] = await Promise.all([countQuery, dataQuery]);
    return { accounts, totalCount: Number(countResult?.count ?? 0) };
  };

  // Just the columns needed to map a run-as fingerprint to its account (and to reconcile staleness), without
  // pulling every row's encryptedDetails buffer into memory (a large domain can have tens of thousands of rows).
  const findFingerprintLinks = async (discoverySourceId: string, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.PamDiscoveredAccount)
      .where({ discoverySourceId })
      .select("id", "fingerprint", "importedAccountId", "accountType");

  // Flag imported accounts a scan no longer found (staged ones are deleted instead, see deleteByIds). The
  // caller scopes which ids; `= ANY(?)` binds the list as one param.
  const markStale = async (ids: string[], tx?: Knex): Promise<void> => {
    if (!ids.length) return;
    await (tx || db)(TableName.PamDiscoveredAccount).whereRaw(`"id" = ANY(?::uuid[])`, [ids]).update({ isStale: true });
  };

  const deleteByIds = async (ids: string[], tx?: Knex): Promise<void> => {
    if (!ids.length) return;
    await (tx || db)(TableName.PamDiscoveredAccount).whereRaw(`"id" = ANY(?::uuid[])`, [ids]).delete();
  };

  return { ...orm, upsertByFingerprint, listStaged, listStale, findFingerprintLinks, markStale, deleteByIds };
};
