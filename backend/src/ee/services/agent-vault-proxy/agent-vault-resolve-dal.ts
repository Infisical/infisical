import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

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
   */
  const findResolvableConnections = async (
    {
      sessionId,
      projectId,
      actor,
      isAdmin
    }: {
      sessionId: string;
      projectId: string;
      actor: { type: ActorType.USER | ActorType.IDENTITY; id: string };
      /** An admin reaches every bundle, so the member filter is skipped — symmetrically with mint. */
      isAdmin: boolean;
    },
    tx?: Knex
  ): Promise<TResolveConnectionRow[]> => {
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

      if (!isAdmin) {
        void query.whereExists((qb) => {
          void qb
            .select(db.raw("1"))
            .from(TableName.AgentVaultAccessBundleMember)
            .whereRaw(`??.?? = ??.??`, [
              TableName.AgentVaultAccessBundleMember,
              "accessBundleId",
              TableName.AgentVaultAccessBundle,
              "id"
            ])
            .where((actorQb) => {
              if (actor.type === ActorType.USER) {
                void actorQb
                  .where(`${TableName.AgentVaultAccessBundleMember}.userId`, actor.id)
                  .orWhereIn(
                    `${TableName.AgentVaultAccessBundleMember}.groupId`,
                    conn(TableName.UserGroupMembership).where("userId", actor.id).select("groupId")
                  );
              } else {
                void actorQb
                  .where(`${TableName.AgentVaultAccessBundleMember}.identityId`, actor.id)
                  .orWhereIn(
                    `${TableName.AgentVaultAccessBundleMember}.groupId`,
                    conn(TableName.IdentityGroupMembership).where("identityId", actor.id).select("groupId")
                  );
              }
            });
        });
      }

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
