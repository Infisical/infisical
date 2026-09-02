import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultSessions } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";

import { AgentVaultSessionStatus } from "../agent-vault/agent-vault-enums";

export type TAgentVaultSessionDALFactory = ReturnType<typeof agentVaultSessionDALFactory>;

export type TAgentVaultSessionListRow = {
  id: string;
  userId: string | null;
  identityId: string | null;
  /** The person or machine the session runs as, ready to render. */
  actorName: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  accessBundles: { id: string | null; name: string; position: number }[];
};

// Status is derived from the two timestamps at read time, never stored: a read path that writes is how
// "expired" ends up disagreeing with what the proxy sees.
const statusFilter = (query: Knex.QueryBuilder, status: AgentVaultSessionStatus, now: Date) => {
  if (status === AgentVaultSessionStatus.Revoked) {
    void query.whereNotNull(`${TableName.AgentVaultSession}.revokedAt`);
    return;
  }
  if (status === AgentVaultSessionStatus.Expired) {
    void query
      .whereNull(`${TableName.AgentVaultSession}.revokedAt`)
      .whereNotNull(`${TableName.AgentVaultSession}.expiresAt`)
      .where(`${TableName.AgentVaultSession}.expiresAt`, "<=", now);
    return;
  }
  void query.whereNull(`${TableName.AgentVaultSession}.revokedAt`).where((qb) => {
    void qb
      .whereNull(`${TableName.AgentVaultSession}.expiresAt`)
      .orWhere(`${TableName.AgentVaultSession}.expiresAt`, ">", now);
  });
};

export const agentVaultSessionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultSession);

  const findByTokenHash = async (tokenHash: string, tx?: Knex): Promise<TAgentVaultSessions | undefined> => {
    try {
      return await (tx || db.replicaNode())(TableName.AgentVaultSession).where({ tokenHash }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session by token hash" });
    }
  };

  const findForList = async (
    {
      projectId,
      actor,
      status,
      limit,
      offset
    }: {
      projectId: string;
      /** Undefined lists every actor's sessions; only an administrator may ask for that. */
      actor?: { type: ActorType.USER | ActorType.IDENTITY; id: string };
      status?: AgentVaultSessionStatus;
      limit: number;
      offset: number;
    },
    tx?: Knex
  ): Promise<{ sessions: TAgentVaultSessionListRow[]; totalCount: number }> => {
    try {
      const conn = tx || db.replicaNode();
      const now = new Date();

      const applyFilters = (query: Knex.QueryBuilder) => {
        void query.where(`${TableName.AgentVaultSession}.projectId`, projectId);
        if (actor?.type === ActorType.USER) void query.where(`${TableName.AgentVaultSession}.userId`, actor.id);
        if (actor?.type === ActorType.IDENTITY) void query.where(`${TableName.AgentVaultSession}.identityId`, actor.id);
        if (status) statusFilter(query, status, now);
        return query;
      };

      const countResult = (await applyFilters(conn(TableName.AgentVaultSession))
        .count(`${TableName.AgentVaultSession}.id as count`)
        .first()) as { count: string } | undefined;
      const totalCount = parseInt(countResult?.count || "0", 10);

      const pageIds = (await applyFilters(conn(TableName.AgentVaultSession))
        .orderBy(`${TableName.AgentVaultSession}.createdAt`, "desc")
        .limit(limit)
        .offset(offset)
        .select(`${TableName.AgentVaultSession}.id`)) as { id: string }[];

      if (!pageIds.length) return { sessions: [], totalCount };

      const rows = (await conn(TableName.AgentVaultSession)
        .whereIn(
          `${TableName.AgentVaultSession}.id`,
          pageIds.map((row) => row.id)
        )
        .leftJoin(TableName.Users, `${TableName.AgentVaultSession}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.Identity, `${TableName.AgentVaultSession}.identityId`, `${TableName.Identity}.id`)
        .leftJoin(
          TableName.AgentVaultSessionAccessBundle,
          `${TableName.AgentVaultSessionAccessBundle}.sessionId`,
          `${TableName.AgentVaultSession}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.AgentVaultSession),
          db.ref("userId").withSchema(TableName.AgentVaultSession),
          db.ref("identityId").withSchema(TableName.AgentVaultSession),
          db.ref("expiresAt").withSchema(TableName.AgentVaultSession),
          db.ref("revokedAt").withSchema(TableName.AgentVaultSession),
          db.ref("createdAt").withSchema(TableName.AgentVaultSession),
          db.ref("username").withSchema(TableName.Users).as("userUsername"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("accessBundleId").withSchema(TableName.AgentVaultSessionAccessBundle),
          db.ref("accessBundleName").withSchema(TableName.AgentVaultSessionAccessBundle),
          db.ref("position").withSchema(TableName.AgentVaultSessionAccessBundle)
        )
        .orderBy(`${TableName.AgentVaultSession}.createdAt`, "desc")
        .orderBy(`${TableName.AgentVaultSessionAccessBundle}.position`, "asc")) as {
        id: string;
        userId: string | null;
        identityId: string | null;
        expiresAt: Date | null;
        revokedAt: Date | null;
        createdAt: Date;
        userUsername: string | null;
        identityName: string | null;
        accessBundleId: string | null;
        accessBundleName: string | null;
        position: number | null;
      }[];

      const bySession = new Map<string, TAgentVaultSessionListRow>();
      rows.forEach((row) => {
        let session = bySession.get(row.id);
        if (!session) {
          session = {
            id: row.id,
            userId: row.userId,
            identityId: row.identityId,
            actorName: row.identityName ?? row.userUsername ?? "",
            expiresAt: row.expiresAt,
            revokedAt: row.revokedAt,
            createdAt: row.createdAt,
            accessBundles: []
          };
          bySession.set(row.id, session);
        }
        if (row.accessBundleName === null || row.position === null) return;
        session.accessBundles.push({
          id: row.accessBundleId,
          name: row.accessBundleName,
          position: row.position
        });
      });

      return { sessions: [...bySession.values()], totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault sessions" });
    }
  };

  // Sessions whose expiry fell inside (since, until], skipping ones already ended by a revoke.
  const findExpiredBetween = async (since: Date, until: Date, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.AgentVaultSession)
        .whereNotNull("expiresAt")
        .where("expiresAt", ">", since)
        .where("expiresAt", "<=", until)
        .whereNull("revokedAt")
        .select("id", "projectId", "expiresAt");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find expired Agent Vault sessions" });
    }
  };

  // Hard-deletes sessions retired before the cutoff: revoked ones by revokedAt, the rest by expiresAt.
  // A never-expiring session is only ever reaped once revoked. The child rows follow by cascade.
  const pruneRetiredBefore = async (cutoff: Date, tx?: Knex) => {
    try {
      return await (tx || db)(TableName.AgentVaultSession)
        .where((qb) => {
          void qb.where("revokedAt", "<", cutoff).orWhere((inner) => {
            void inner.whereNull("revokedAt").where("expiresAt", "<", cutoff);
          });
        })
        .del();
    } catch (error) {
      throw new DatabaseError({ error, name: "Prune retired Agent Vault sessions" });
    }
  };

  return { ...orm, findByTokenHash, findForList, findExpiredBetween, pruneRetiredBefore };
};
