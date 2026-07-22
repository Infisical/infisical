import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPamAccountDependencyDALFactory = ReturnType<typeof pamAccountDependencyDALFactory>;

type TUpsertDependency = {
  projectId: string;
  fingerprint: string;
  machine: string;
  type: string;
  name: string;
  data: unknown;
  accountId: string | null;
  discoveredAccountId: string | null;
};

export const pamAccountDependencyDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamAccountDependency);

  // Upsert a discovered dependency keyed by its stable identity, returning the row id. Atomic (single
  // INSERT ... ON CONFLICT) so overlapping scans of the same machine can't race on the unique index. Discovery
  // owns fingerprint / machine / type / name / data and the account linkage; on conflict only those are merged,
  // so rotation-owned columns (rotationStatus, lastRotatedAt, encryptedLastRotationMessage) are never touched.
  //
  // Imported wins: a row already linked to a managed account (accountId set) is never demoted back to a staged
  // link, so a second discovery source scanning the same machine can't silently break rotation sync for an
  // account another source imported.
  // `xmax = 0` is true only for the freshly-inserted tuple; on an ON CONFLICT update xmax is the updating txid,
  // so it distinguishes a newly-discovered dependency from one the scan merely re-saw (drives the run's new count).
  const upsertByIdentity = async (dep: TUpsertDependency, tx?: Knex): Promise<{ id: string; isNew: boolean }> => {
    const conn = tx || db;
    const { projectId, fingerprint, machine, type, name, data, accountId, discoveredAccountId } = dep;
    const [row] = await conn(TableName.PamAccountDependency)
      .insert({ projectId, fingerprint, machine, type, name, data, accountId, discoveredAccountId })
      .onConflict(["projectId", "fingerprint", "machine", "type", "name"])
      .merge({
        data,
        accountId: conn.raw(`COALESCE(??."accountId", EXCLUDED."accountId")`, [TableName.PamAccountDependency]),
        discoveredAccountId: conn.raw(
          `CASE WHEN ??."accountId" IS NOT NULL THEN NULL ELSE EXCLUDED."discoveredAccountId" END`,
          [TableName.PamAccountDependency]
        )
      })
      .returning(["id", conn.raw("(xmax = 0) AS inserted")]);
    const inserted = row as { id: string; inserted?: boolean };
    return { id: inserted.id, isNew: Boolean(inserted.inserted) };
  };

  // Prune dependencies the current scan no longer found. Scoped to this source's accounts (staged or their
  // imported counterparts) and to the machines the scan actually re-checked, so an unreachable machine or a
  // narrower source never drops another scan's dependencies.
  const deleteStaleForSource = async (
    {
      projectId,
      accountIds,
      discoveredAccountIds,
      scannedMachines,
      keepIds
    }: {
      projectId: string;
      accountIds: string[];
      discoveredAccountIds: string[];
      scannedMachines: string[];
      keepIds: string[];
    },
    tx?: Knex
  ): Promise<void> => {
    if (!scannedMachines.length || (!accountIds.length && !discoveredAccountIds.length)) return;

    // Bind each list as a single array parameter (`= ANY(?)`) rather than one bind per element, so a large
    // domain can't blow past Postgres's 65,535 bind-parameter cap and fail the reconcile after upserts wrote.
    // Scoped to this tenant's project so a scan never touches another org's rows sharing the same machine name.
    await (tx || db)(TableName.PamAccountDependency)
      .where("projectId", projectId)
      .whereRaw(`"machine" = ANY(?::text[])`, [scannedMachines])
      .where((qb) => {
        if (accountIds.length) void qb.whereRaw(`"accountId" = ANY(?::uuid[])`, [accountIds]);
        if (discoveredAccountIds.length)
          void qb.orWhereRaw(`"discoveredAccountId" = ANY(?::uuid[])`, [discoveredAccountIds]);
      })
      .whereRaw(`NOT ("id" = ANY(?::uuid[]))`, [keepIds])
      .delete();
  };

  // On import, flip a staged dependency onto its managed account: set accountId, clear discoveredAccountId.
  const backfillImported = async (discoveredAccountId: string, accountId: string, tx?: Knex): Promise<void> => {
    await (tx || db)(TableName.PamAccountDependency)
      .where({ discoveredAccountId })
      .update({ accountId, discoveredAccountId: null });
  };

  const findByAccountId = async (accountId: string, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.PamAccountDependency)
      .where({ accountId })
      .orderBy([
        { column: "machine", order: "asc" },
        { column: "name", order: "asc" }
      ]);

  const findByDiscoveredAccountIds = async (discoveredAccountIds: string[], tx?: Knex) => {
    if (!discoveredAccountIds.length) return [];
    return (tx || db.replicaNode())(TableName.PamAccountDependency)
      .whereIn("discoveredAccountId", discoveredAccountIds)
      .orderBy([
        { column: "machine", order: "asc" },
        { column: "name", order: "asc" }
      ]);
  };

  return {
    ...orm,
    upsertByIdentity,
    backfillImported,
    deleteStaleForSource,
    findByAccountId,
    findByDiscoveredAccountIds
  };
};
