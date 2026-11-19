import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultHooks } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify } from "@app/lib/knex";

import { TStoredHookRule } from "./agent-vault-hook-fns";

export type TAgentVaultHookDALFactory = ReturnType<typeof agentVaultHookDALFactory>;

// A hook as every read returns it: never with its secret.
export type TAgentVaultHookRow = Omit<TAgentVaultHooks, "encryptedSecret">;

const HOOK_COLUMNS = [
  "id",
  "projectId",
  "sessionId",
  "name",
  "description",
  "url",
  "rules",
  "secretsDeletedAt",
  "createdAt",
  "updatedAt"
] as const;

const hookColumns = HOOK_COLUMNS.map((column) => `${TableName.AgentVaultHook}.${column}`);

// Mirrors deriveSessionStatus: revoked, expired, or left without its owner or the user it acts for.
const whereSessionEnded = (query: Knex.QueryBuilder, conn: Knex) =>
  query.where((ended) => {
    void ended
      .whereNotNull(`${TableName.AgentVaultSession}.revokedAt`)
      .orWhere(`${TableName.AgentVaultSession}.expiresAt`, "<=", conn.fn.now())
      .orWhere((ownerless) => {
        void ownerless
          .whereNull(`${TableName.AgentVaultSession}.userId`)
          .whereNull(`${TableName.AgentVaultSession}.identityId`);
      })
      .orWhere((orphaned) => {
        void orphaned
          .whereNotNull(`${TableName.AgentVaultSession}.onBehalfOfUserName`)
          .whereNull(`${TableName.AgentVaultSession}.onBehalfOfUserId`);
      });
  });

/**
 * Deletes the secret of the hook sent inline with a session, keeping its URL and rules for history. Called beside the
 * inline services' own delete, in its transaction, so a session's secrets all go together. Never writes the session
 * row, whose updatedAt dates an ownerless session's last logs.
 */
export const deleteInlineHookSecretBySessionId = async (sessionId: string, tx: Knex) => {
  await tx(TableName.AgentVaultHook)
    .where({ sessionId })
    .whereNull("secretsDeletedAt")
    .update({ encryptedSecret: null, secretsDeletedAt: new Date() });
};

/** The inline hooks of sessions that can no longer resolve, a batch at a time, in the caller's transaction. */
export const deleteInlineHookSecretsOfEndedSessions = async (tx: Knex, limit: number): Promise<number> => {
  const rows = (await whereSessionEnded(
    tx(TableName.AgentVaultHook)
      .join(TableName.AgentVaultSession, `${TableName.AgentVaultSession}.id`, `${TableName.AgentVaultHook}.sessionId`)
      .whereNotNull(`${TableName.AgentVaultHook}.sessionId`)
      .whereNull(`${TableName.AgentVaultHook}.secretsDeletedAt`),
    tx
  )
    .limit(limit)
    .forUpdate(TableName.AgentVaultHook)
    .skipLocked()
    .select(`${TableName.AgentVaultHook}.id`)) as { id: string }[];
  if (!rows.length) return 0;
  await tx(TableName.AgentVaultHook)
    .whereIn(
      "id",
      rows.map((row) => row.id)
    )
    .update({ encryptedSecret: null, secretsDeletedAt: new Date() });
  return rows.length;
};

/**
 * The project's services (never a session's inline ones) with one of these IDs or names, for hook rules, which store a
 * project service by ID and show its current name. On the caller's connection, so resolve can read a replica.
 */
export const findProjectServicesForHookRules = async (
  conn: Knex,
  { projectId, ids = [], names = [] }: { projectId: string; ids?: string[]; names?: string[] }
): Promise<{ id: string; name: string }[]> => {
  if (!ids.length && !names.length) return [];
  try {
    return (await conn(TableName.AgentVaultService)
      .where({ projectId })
      .whereNull("sessionId")
      .whereNotNull("name")
      .where((qb) => {
        if (ids.length) void qb.orWhereIn("id", ids);
        if (names.length) void qb.orWhereIn("name", names);
      })
      .select("id", "name")) as { id: string; name: string }[];
  } catch (error) {
    throw new DatabaseError({ error, name: "Find agent vault services for hook rules" });
  }
};

export const findHookRuleServiceNames = async (
  conn: Knex,
  { projectId, ids }: { projectId: string; ids: string[] }
): Promise<Map<string, string>> =>
  new Map(
    (await findProjectServicesForHookRules(conn, { projectId, ids })).map((service) => [service.id, service.name])
  );

/**
 * Saved hooks are the project's and reached through the hooks routes. A hook sent inline with a session (sessionId set)
 * belongs to that session alone: it is written only by insertInlineForSession and never returned by the saved-hook
 * reads, so the hooks routes can't read or change it.
 */
export const agentVaultHookDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultHook);

  const savedHooks = (conn: Knex) => conn(TableName.AgentVaultHook).whereNull(`${TableName.AgentVaultHook}.sessionId`);

  // Reads the primary even without a tx, so a hook created or edited a moment ago is listed as it now is.
  const findForList = async (
    {
      projectId,
      search,
      limit,
      offset
    }: {
      projectId: string;
      search?: string;
      limit: number;
      offset: number;
    },
    tx?: Knex
  ): Promise<{ hooks: TAgentVaultHookRow[]; totalCount: number }> => {
    try {
      const conn = tx || db;
      const applyFilters = (query: Knex.QueryBuilder) => {
        void query.where(`${TableName.AgentVaultHook}.projectId`, projectId);
        if (search) {
          const term = `%${sanitizeSqlLikeString(search)}%`;
          void query.where((qb) => {
            void qb
              .orWhereILike(`${TableName.AgentVaultHook}.name`, term)
              .orWhereILike(`${TableName.AgentVaultHook}.url`, term);
          });
        }
        return query;
      };

      const [countResult, rows] = await Promise.all([
        applyFilters(savedHooks(conn)).count(`${TableName.AgentVaultHook}.id as count`).first() as Promise<
          { count: string } | undefined
        >,
        applyFilters(savedHooks(conn))
          .select(hookColumns)
          .orderBy(`${TableName.AgentVaultHook}.name`, "asc")
          .limit(limit)
          .offset(offset) as Promise<TAgentVaultHookRow[]>
      ]);
      return { hooks: rows, totalCount: parseInt(countResult?.count || "0", 10) };
    } catch (error) {
      throw new DatabaseError({ error, name: "List agent vault hooks" });
    }
  };

  const findSavedByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx?: Knex
  ): Promise<TAgentVaultHookRow | undefined> => {
    try {
      return (await savedHooks(tx || db)
        .where(`${TableName.AgentVaultHook}.id`, id)
        .where(`${TableName.AgentVaultHook}.projectId`, projectId)
        .first(hookColumns)) as TAgentVaultHookRow | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault hook" });
    }
  };

  // Taken by an update and a delete, so an update racing a delete gets a 404 and two updates apply one after the other.
  const lockSavedByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx: Knex
  ): Promise<TAgentVaultHookRow | undefined> => {
    try {
      return (await savedHooks(tx)
        .where(`${TableName.AgentVaultHook}.id`, id)
        .where(`${TableName.AgentVaultHook}.projectId`, projectId)
        .forUpdate()
        .first(hookColumns)) as TAgentVaultHookRow | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault hook" });
    }
  };

  const findSavedByNameInProject = async (
    { name, projectId, excludeId }: { name: string; projectId: string; excludeId?: string },
    tx?: Knex
  ): Promise<TAgentVaultHookRow | undefined> => {
    try {
      const query = savedHooks(tx || db)
        .where(`${TableName.AgentVaultHook}.projectId`, projectId)
        .whereRaw(`lower(??) = lower(?)`, [`${TableName.AgentVaultHook}.name`, name]);
      if (excludeId) void query.whereNot(`${TableName.AgentVaultHook}.id`, excludeId);
      return (await query.first(hookColumns)) as TAgentVaultHookRow | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault hook by name" });
    }
  };

  // Held until mint commits, so a delete of the hook waits for the session that references it, or wins and the mint
  // reads the hook as missing instead of failing on the foreign key.
  const findSavedForMint = async (
    { id, projectId }: { id: string; projectId: string },
    tx: Knex
  ): Promise<TAgentVaultHookRow | undefined> => {
    try {
      return (await savedHooks(tx)
        .where(`${TableName.AgentVaultHook}.id`, id)
        .where(`${TableName.AgentVaultHook}.projectId`, projectId)
        .forShare()
        .first(hookColumns)) as TAgentVaultHookRow | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault hook for a session" });
    }
  };

  const insertInlineForSession = async (
    {
      projectId,
      sessionId,
      url,
      encryptedSecret,
      rules
    }: { projectId: string; sessionId: string; url: string; encryptedSecret: Buffer; rules: TStoredHookRule[] },
    tx: Knex
  ): Promise<TAgentVaultHookRow> => {
    try {
      const [row] = (await tx(TableName.AgentVaultHook)
        .insert({ projectId, sessionId, url, encryptedSecret, rules: JSON.stringify(rules) })
        .returning(HOOK_COLUMNS)) as TAgentVaultHookRow[];
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create agent vault session inline hook" });
    }
  };

  return {
    ...orm,
    findForList,
    findSavedByIdInProject,
    lockSavedByIdInProject,
    findSavedByNameInProject,
    findSavedForMint,
    insertInlineForSession,
    findProjectServicesForHookRules: (scope: { projectId: string; ids?: string[]; names?: string[] }, tx?: Knex) =>
      findProjectServicesForHookRules(tx || db, scope),
    findHookRuleServiceNames: (scope: { projectId: string; ids: string[] }, tx?: Knex) =>
      findHookRuleServiceNames(tx || db, scope)
  };
};
