import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultSessions, TAgentVaultSessionsInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";

import { AgentVaultMemberType, AgentVaultSessionStatus } from "../agent-vault/agent-vault-enums";
import { TAgentVaultSessionActor, TAgentVaultSessionOnBehalfOf } from "./agent-vault-session-types";

export type TAgentVaultSessionDALFactory = ReturnType<typeof agentVaultSessionDALFactory>;

export type TAgentVaultSessionListRow = {
  id: string;
  userId: string | null;
  identityId: string | null;
  onBehalfOfUserId: string | null;
  onBehalfOfUserName: string | null;
  label: string | null;
  actor: TAgentVaultSessionActor;
  onBehalfOf: TAgentVaultSessionOnBehalfOf | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  accessBundles: { id: string | null; name: string; position: number }[];
};

// The on-behalf-of user's own alias, since the actor's user is joined under the table's name.
const ON_BEHALF_OF_USER = "onBehalfOfUser";

// Mirrors deriveSessionStatus: a session with neither actor id, or whose on-behalf-of user was deleted, counts as revoked.
const orphaned = (qb: Knex.QueryBuilder) =>
  void qb
    .where((sub) => {
      void sub
        .whereNull(`${TableName.AgentVaultSession}.userId`)
        .whereNull(`${TableName.AgentVaultSession}.identityId`);
    })
    .orWhere((sub) => {
      void sub
        .whereNotNull(`${TableName.AgentVaultSession}.onBehalfOfUserName`)
        .whereNull(`${TableName.AgentVaultSession}.onBehalfOfUserId`);
    });
const live = (qb: Knex.QueryBuilder) =>
  void qb
    .where((sub) => {
      void sub
        .whereNotNull(`${TableName.AgentVaultSession}.userId`)
        .orWhereNotNull(`${TableName.AgentVaultSession}.identityId`);
    })
    .where((sub) => {
      void sub
        .whereNull(`${TableName.AgentVaultSession}.onBehalfOfUserName`)
        .orWhereNotNull(`${TableName.AgentVaultSession}.onBehalfOfUserId`);
    });

const statusFilter = (query: Knex.QueryBuilder, status: AgentVaultSessionStatus, now: Date) => {
  if (status === AgentVaultSessionStatus.Revoked) {
    void query.where((qb) => {
      void qb.whereNotNull(`${TableName.AgentVaultSession}.revokedAt`).orWhere(orphaned);
    });
    return;
  }
  if (status === AgentVaultSessionStatus.Expired) {
    void query
      .whereNull(`${TableName.AgentVaultSession}.revokedAt`)
      .where(live)
      .whereNotNull(`${TableName.AgentVaultSession}.expiresAt`)
      .where(`${TableName.AgentVaultSession}.expiresAt`, "<=", now);
    return;
  }
  void query
    .whereNull(`${TableName.AgentVaultSession}.revokedAt`)
    .where(live)
    .where((qb) => {
      void qb
        .whereNull(`${TableName.AgentVaultSession}.expiresAt`)
        .orWhere(`${TableName.AgentVaultSession}.expiresAt`, ">", now);
    });
};

type TJoinedUser = {
  id: string | null;
  username: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

// A deleted user leaves only the snapshot mint took, which holds the full name in one field.
const toSessionUser = (
  user: TJoinedUser,
  snapshot: { name: string; email: string | null }
): TAgentVaultSessionOnBehalfOf => {
  if (user.id && user.username) {
    return {
      type: AgentVaultMemberType.User,
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    };
  }
  return {
    type: AgentVaultMemberType.User,
    id: null,
    username: snapshot.email ?? snapshot.name,
    email: snapshot.email,
    firstName: snapshot.name || null,
    lastName: null
  };
};

const toSessionActor = (row: {
  actorType?: string | null;
  userId: string | null;
  identityId: string | null;
  userUsername: string | null;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  identityName: string | null;
  actorName: string;
  actorEmail: string | null;
}): TAgentVaultSessionActor => {
  // Null only on rows written by a pod still on the previous release during a rolling deploy.
  const actorType =
    row.actorType ??
    (row.identityId || (!row.userId && !row.actorEmail)
      ? AgentVaultMemberType.MachineIdentity
      : AgentVaultMemberType.User);
  if (actorType === AgentVaultMemberType.MachineIdentity) {
    return { type: AgentVaultMemberType.MachineIdentity, id: row.identityId, name: row.identityName ?? row.actorName };
  }
  return toSessionUser(
    {
      id: row.userId,
      username: row.userUsername,
      email: row.userEmail,
      firstName: row.userFirstName,
      lastName: row.userLastName
    },
    { name: row.actorName, email: row.actorEmail }
  );
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
      sessionId,
      actor,
      statuses,
      search,
      limit,
      offset
    }: {
      projectId: string;
      sessionId?: string;
      actor?: { type: ActorType.USER | ActorType.IDENTITY; id: string };
      statuses?: AgentVaultSessionStatus[];
      search?: string;
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
        if (sessionId) void query.where(`${TableName.AgentVaultSession}.id`, sessionId);
        // A session on a user's behalf is the identity's, so it is never in the user's own list.
        if (actor?.type === ActorType.USER) void query.where(`${TableName.AgentVaultSession}.userId`, actor.id);
        if (actor?.type === ActorType.IDENTITY) void query.where(`${TableName.AgentVaultSession}.identityId`, actor.id);
        if (statuses?.length) {
          void query.where((qb) => {
            statuses.forEach((status) => {
              void qb.orWhere((sub) => statusFilter(sub, status, now));
            });
          });
        }
        // Shared with the count query, so the pager describes the filtered set rather than the whole one.
        if (search) {
          const term = `%${sanitizeSqlLikeString(search)}%`;
          // Joined so the search sees the same live-then-snapshot name the rows display; searching the
          // snapshot alone would miss a renamed actor and match a name no longer shown.
          void query
            .leftJoin(TableName.Users, `${TableName.AgentVaultSession}.userId`, `${TableName.Users}.id`)
            .leftJoin(TableName.Identity, `${TableName.AgentVaultSession}.identityId`, `${TableName.Identity}.id`)
            .leftJoin(
              `${TableName.Users} as ${ON_BEHALF_OF_USER}`,
              `${TableName.AgentVaultSession}.onBehalfOfUserId`,
              `${ON_BEHALF_OF_USER}.id`
            );

          void query.where((qb) => {
            void qb
              .orWhereILike(`${TableName.AgentVaultSession}.label`, term)
              .orWhereILike(`${TableName.Identity}.name`, term)
              .orWhereILike(`${TableName.Users}.username`, term)
              // Covers a first name, a last name and the two together, so no separate checks are needed.
              .orWhereRaw(`CONCAT_WS(' ', ??, ??) ILIKE ?`, [
                `${TableName.Users}.firstName`,
                `${TableName.Users}.lastName`,
                term
              ])
              .orWhereILike(`${TableName.AgentVaultSession}.actorName`, term)
              .orWhereILike(`${TableName.AgentVaultSession}.actorEmail`, term)
              .orWhereILike(`${ON_BEHALF_OF_USER}.username`, term)
              .orWhereRaw(`CONCAT_WS(' ', ??, ??) ILIKE ?`, [
                `${ON_BEHALF_OF_USER}.firstName`,
                `${ON_BEHALF_OF_USER}.lastName`,
                term
              ])
              .orWhereILike(`${TableName.AgentVaultSession}.onBehalfOfUserName`, term)
              .orWhereILike(`${TableName.AgentVaultSession}.onBehalfOfUserEmail`, term)
              .orWhereExists((sub) => {
                void sub
                  .select(db.raw("1"))
                  .from(TableName.AgentVaultSessionAccessBundle)
                  .leftJoin(
                    TableName.AgentVaultAccessBundle,
                    `${TableName.AgentVaultAccessBundle}.id`,
                    `${TableName.AgentVaultSessionAccessBundle}.accessBundleId`
                  )
                  .whereRaw(`?? = ??`, [
                    `${TableName.AgentVaultSessionAccessBundle}.sessionId`,
                    `${TableName.AgentVaultSession}.id`
                  ])
                  // The live name is what the row displays, with the snapshot standing in once the
                  // bundle is gone, so the search has to look at whichever one is shown.
                  .whereRaw(`COALESCE(??, ??) ILIKE ?`, [
                    `${TableName.AgentVaultAccessBundle}.name`,
                    `${TableName.AgentVaultSessionAccessBundle}.accessBundleName`,
                    term
                  ]);
              });
          });
        }
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
          `${TableName.Users} as ${ON_BEHALF_OF_USER}`,
          `${TableName.AgentVaultSession}.onBehalfOfUserId`,
          `${ON_BEHALF_OF_USER}.id`
        )
        .leftJoin(
          TableName.AgentVaultSessionAccessBundle,
          `${TableName.AgentVaultSessionAccessBundle}.sessionId`,
          `${TableName.AgentVaultSession}.id`
        )
        // The snapshot on the junction row is what a deleted bundle leaves behind; while the bundle is
        // still there its current name is the truthful one, so a rename shows on every session at once.
        .leftJoin(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultAccessBundle}.id`,
          `${TableName.AgentVaultSessionAccessBundle}.accessBundleId`
        )
        .select(
          db.ref("id").withSchema(TableName.AgentVaultSession),
          db.ref("userId").withSchema(TableName.AgentVaultSession),
          db.ref("identityId").withSchema(TableName.AgentVaultSession),
          db.ref("label").withSchema(TableName.AgentVaultSession),
          db.ref("expiresAt").withSchema(TableName.AgentVaultSession),
          db.ref("revokedAt").withSchema(TableName.AgentVaultSession),
          db.ref("createdAt").withSchema(TableName.AgentVaultSession),
          db.ref("actorType").withSchema(TableName.AgentVaultSession),
          db.ref("username").withSchema(TableName.Users).as("userUsername"),
          db.ref("email").withSchema(TableName.Users).as("userEmail"),
          db.ref("firstName").withSchema(TableName.Users).as("userFirstName"),
          db.ref("lastName").withSchema(TableName.Users).as("userLastName"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("actorName").withSchema(TableName.AgentVaultSession),
          db.ref("actorEmail").withSchema(TableName.AgentVaultSession),
          db.ref("onBehalfOfUserId").withSchema(TableName.AgentVaultSession),
          db.ref("onBehalfOfUserName").withSchema(TableName.AgentVaultSession),
          db.ref("onBehalfOfUserEmail").withSchema(TableName.AgentVaultSession),
          db.ref("username").withSchema(ON_BEHALF_OF_USER).as("onBehalfOfUserLiveUsername"),
          db.ref("email").withSchema(ON_BEHALF_OF_USER).as("onBehalfOfUserLiveEmail"),
          db.ref("firstName").withSchema(ON_BEHALF_OF_USER).as("onBehalfOfUserLiveFirstName"),
          db.ref("lastName").withSchema(ON_BEHALF_OF_USER).as("onBehalfOfUserLiveLastName"),
          db.ref("accessBundleId").withSchema(TableName.AgentVaultSessionAccessBundle),
          db.ref("accessBundleName").withSchema(TableName.AgentVaultSessionAccessBundle),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("liveAccessBundleName"),
          db.ref("position").withSchema(TableName.AgentVaultSessionAccessBundle)
        )
        .orderBy(`${TableName.AgentVaultSession}.createdAt`, "desc")
        .orderBy(`${TableName.AgentVaultSessionAccessBundle}.position`, "asc")) as {
        id: string;
        userId: string | null;
        identityId: string | null;
        label: string | null;
        expiresAt: Date | null;
        revokedAt: Date | null;
        createdAt: Date;
        actorType: string | null;
        userUsername: string | null;
        userEmail: string | null;
        userFirstName: string | null;
        userLastName: string | null;
        identityName: string | null;
        actorName: string;
        actorEmail: string | null;
        onBehalfOfUserId: string | null;
        onBehalfOfUserName: string | null;
        onBehalfOfUserEmail: string | null;
        onBehalfOfUserLiveUsername: string | null;
        onBehalfOfUserLiveEmail: string | null;
        onBehalfOfUserLiveFirstName: string | null;
        onBehalfOfUserLiveLastName: string | null;
        accessBundleId: string | null;
        accessBundleName: string | null;
        liveAccessBundleName: string | null;
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
            onBehalfOfUserId: row.onBehalfOfUserId,
            onBehalfOfUserName: row.onBehalfOfUserName,
            label: row.label,
            actor: toSessionActor(row),
            onBehalfOf:
              row.onBehalfOfUserName !== null
                ? toSessionUser(
                    {
                      id: row.onBehalfOfUserId,
                      username: row.onBehalfOfUserLiveUsername,
                      email: row.onBehalfOfUserLiveEmail,
                      firstName: row.onBehalfOfUserLiveFirstName,
                      lastName: row.onBehalfOfUserLiveLastName
                    },
                    { name: row.onBehalfOfUserName, email: row.onBehalfOfUserEmail }
                  )
                : null,
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
          name: row.liveAccessBundleName ?? row.accessBundleName,
          position: row.position
        });
      });

      return { sessions: [...bySession.values()], totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault sessions" });
    }
  };

  // Conditional so two concurrent revokes cannot both believe they were the one that revoked it. The loser
  // gets no row back, which is what keeps the audit trail down to a single revocation. A session whose owner, or the
  // user it was started on behalf of, was deleted is skipped too: updatedAt is the only record of when, and this write
  // would move it.
  const revokeIfActive = async (id: string, revokedAt: Date, tx?: Knex) => {
    try {
      const [row] = (await (tx || db)(TableName.AgentVaultSession)
        .where({ id })
        .whereNull("revokedAt")
        .where((qb) => {
          void qb.whereNotNull("userId").orWhereNotNull("identityId");
        })
        .where((qb) => {
          void qb.whereNull("onBehalfOfUserName").orWhereNotNull("onBehalfOfUserId");
        })
        .update({ revokedAt }, "*")) as TAgentVaultSessions[];
      return row as TAgentVaultSessions | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Revoke agent vault session" });
    }
  };

  // One statement on the primary: the row is locked, then rewritten only if it still has an owner (and, on a
  // user's behalf, its user), and its label
  // before the write comes back. So two quick edits can't both read a stale label, the caller audits what
  // actually changed, and a session whose owner was just deleted isn't written even if a replica hasn't seen
  // that yet: updatedAt is the only record of when the owner went. No row back means no such session.
  const updateLabel = async (id: string, projectId: string, label: string | null, tx?: Knex) => {
    try {
      const { rows } = (await (tx || db).raw(
        `WITH previous AS (
          SELECT id, label, "userId", "identityId", "onBehalfOfUserId", "onBehalfOfUserName"
          FROM ?? WHERE id = ? AND "projectId" = ? FOR UPDATE
        ), updated AS (
          UPDATE ?? AS session SET label = ? FROM previous
          WHERE session.id = previous.id AND (previous."userId" IS NOT NULL OR previous."identityId" IS NOT NULL)
            AND (previous."onBehalfOfUserName" IS NULL OR previous."onBehalfOfUserId" IS NOT NULL)
          RETURNING session.id
        )
        SELECT previous.label AS "previousLabel", EXISTS (SELECT 1 FROM updated) AS "isUpdated" FROM previous`,
        [TableName.AgentVaultSession, id, projectId, TableName.AgentVaultSession, label]
      )) as { rows: { previousLabel: string | null; isUpdated: boolean }[] };
      return rows[0] as { previousLabel: string | null; isUpdated: boolean } | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update agent vault session label" });
    }
  };

  // Read after a write that didn't happen, so the answer reflects the row as it is, not as a replica last saw it.
  const findByIdOnPrimary = async (id: string, projectId: string, tx?: Knex) => {
    try {
      return (await (tx || db)(TableName.AgentVaultSession).where({ id, projectId }).first()) as
        | TAgentVaultSessions
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session" });
    }
  };

  // The id is chosen by the caller because the session log key is wrapped with it before the row exists.
  const createWithId = async (data: TAgentVaultSessionsInsert & { id: string }, tx?: Knex) => {
    try {
      const [session] = await (tx || db)(TableName.AgentVaultSession)
        .insert(data as never)
        .returning("*");
      return session;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create Agent Vault session" });
    }
  };

  return { ...orm, findByTokenHash, findForList, revokeIfActive, updateLabel, findByIdOnPrimary, createWithId };
};
