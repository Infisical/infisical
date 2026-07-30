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

  // Atomic upsert keyed by stable identity. On conflict only discovery-owned columns merge and an imported row
  // is never demoted to staged; `xmax = 0` flags a fresh insert vs a re-seen row (drives the run's new count).
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

  // Prune dependencies the current scan no longer found, scoped to this source's accounts and the machines it
  // actually re-checked so an unreachable machine or narrower source can't drop another scan's dependencies.
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

    // `= ANY(?)` binds each list as one param (a large domain would blow past Postgres's 65,535 bind cap);
    // scoped to this project so a scan never touches another tenant's rows on a same-named machine.
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
