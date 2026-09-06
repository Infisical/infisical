import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TAgentVaultResolveDALFactory = ReturnType<typeof agentVaultResolveDALFactory>;

export type TResolveConnectionRow = {
  id: string;
  name: string;
  accessBundleName: string;
  hostPattern: string;
  credentialType: string;
  credentialConfig: unknown;
  encryptedCredential: Buffer | null;
  position: number;
};

export const agentVaultResolveDALFactory = (db: TDbClient) => {
  /**
   * The hot path. This is the **intersection**, not a read of the session's bundle table alone: a
   * session's bundle set is a ceiling fixed at mint, re-checked against live grants on every resolve, so
   * losing a grant removes those connections from a running session without touching the session row.
   *
   * Read on the replica and hold no transaction across the decrypt that follows. Replica lag adds to the
   * one-poll-interval staleness promise; if revocation ever has to land in exactly one interval, this is
   * the read to move to the primary.
   *
   * Reachability arrives as an id list rather than a correlated subquery, so grant and credential are two
   * replica reads and each picks its own replica: a grant seen on a lagging replica can pair with a
   * credential rotated after the revoke and seen on a fresh one. Accepted for V1, because the window is
   * bounded by replica lag and reaches only an actor who held that credential moments earlier. A
   * correlated `whereExists` on memberships joined as `"scopeResourceId" = access_bundles.id::text`
   * restores the single snapshot if that guarantee is ever needed.
   */
  const findResolvableConnections = async (
    {
      sessionId,
      projectId,
      accessBundleIds
    }: {
      sessionId: string;
      projectId: string;
      /**
       * What the actor can reach right now, from the same read mint uses. Null for an admin, who reaches
       * every bundle, so the filter is skipped — symmetrically with mint.
       */
      accessBundleIds: string[] | null;
    },
    tx?: Knex
  ): Promise<TResolveConnectionRow[]> => {
    if (accessBundleIds?.length === 0) return [];
    try {
      const conn = tx || db.replicaNode();

      const query = conn(TableName.AgentVaultSessionAccessBundle)
        .where(`${TableName.AgentVaultSessionAccessBundle}.sessionId`, sessionId)
        // A deleted bundle nulls the id and contributes zero connections, while the denormalised name
        // keeps the session readable on the Sessions page.
        .whereNotNull(`${TableName.AgentVaultSessionAccessBundle}.accessBundleId`)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultSessionAccessBundle}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .join(
          TableName.AgentVaultConnection,
          `${TableName.AgentVaultConnection}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        );

      if (accessBundleIds) void query.whereIn(`${TableName.AgentVaultAccessBundle}.id`, accessBundleIds);

      return (
        (await query
          .select(
            db.ref("id").withSchema(TableName.AgentVaultConnection),
            db.ref("name").withSchema(TableName.AgentVaultConnection),
            db.ref("hostPattern").withSchema(TableName.AgentVaultConnection),
            db.ref("credentialType").withSchema(TableName.AgentVaultConnection),
            db.ref("credentialConfig").withSchema(TableName.AgentVaultConnection),
            db.ref("encryptedCredential").withSchema(TableName.AgentVaultConnection),
            db.ref("accessBundleName").withSchema(TableName.AgentVaultSessionAccessBundle),
            db.ref("position").withSchema(TableName.AgentVaultSessionAccessBundle)
          )
          // Bundle position first, then connection name. Position orders bundles, and the write-time
          // overlap rule means two connections in one bundle can never share a host — so the name rung
          // should never decide anything. It is here so the matcher is total rather than silently
          // depending on the order rows come back from the database.
          .orderBy(`${TableName.AgentVaultSessionAccessBundle}.position`, "asc")
          .orderBy(`${TableName.AgentVaultConnection}.name`, "asc")) as TResolveConnectionRow[]
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find resolvable agent vault connections" });
    }
  };

  return { findResolvableConnections };
};
