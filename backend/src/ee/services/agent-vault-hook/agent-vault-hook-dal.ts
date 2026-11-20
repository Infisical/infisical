import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultHooks } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify } from "@app/lib/knex";

import { THookServiceLink, THookServiceLinkInsert } from "./agent-vault-hook-fns";

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
  "appliesToAllServices",
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
 * Deletes the secret of the hook sent inline with a session, keeping its URL and services for history. Called beside the
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

const LINK = TableName.AgentVaultHookService;
const SERVICE = TableName.AgentVaultService;

const linkColumns = (conn: Knex) => [
  `${LINK}.hookId`,
  `${LINK}.serviceId`,
  conn.ref("name").withSchema(SERVICE).as("serviceName"),
  conn.ref("type").withSchema(SERVICE).as("serviceType"),
  `${LINK}.position`,
  `${LINK}.methods`,
  `${LINK}.paths`,
  `${LINK}.tools`
];

/**
 * The services of these hooks with their current names, in rule order. On the caller's connection, so session reads
 * and resolve can read a replica.
 */
export const findHookServiceLinks = async (conn: Knex, hookIds: string[]): Promise<THookServiceLink[]> => {
  if (!hookIds.length) return [];
  try {
    return (await conn(LINK)
      .join(SERVICE, `${SERVICE}.id`, `${LINK}.serviceId`)
      .whereIn(`${LINK}.hookId`, hookIds)
      .orderBy([
        { column: `${LINK}.hookId`, order: "asc" },
        { column: `${LINK}.position`, order: "asc" }
      ])
      .select(linkColumns(conn))) as THookServiceLink[];
  } catch (error) {
    throw new DatabaseError({ error, name: "Find agent vault hook services" });
  }
};

/**
 * The project's services (never a session's inline ones) with these names, taken FOR KEY SHARE in ID order: the lock
 * the links' foreign keys take anyway, so a delete of one waits for the save instead of failing it on the key, and two
 * saves naming the same services take them in the same order.
 */
export const lockProjectServicesForHook = async (
  tx: Knex,
  { projectId, names }: { projectId: string; names: string[] }
): Promise<{ id: string; name: string; type: string }[]> => {
  if (!names.length) return [];
  try {
    return (await tx(SERVICE)
      .where({ projectId })
      .whereNull("sessionId")
      .whereIn("name", [...new Set(names)])
      .orderBy("id", "asc")
      .forKeyShare()
      .select("id", "name", "type")) as { id: string; name: string; type: string }[];
  } catch (error) {
    throw new DatabaseError({ error, name: "Lock agent vault services for a hook" });
  }
};

const toLinkRow = (hookId: string, link: THookServiceLinkInsert) => ({
  hookId,
  serviceId: link.serviceId,
  position: link.position,
  // Stringified: pg would send a JS array as a Postgres array, which a jsonb column refuses.
  methods: link.methods ? JSON.stringify(link.methods) : null,
  paths: link.paths ? JSON.stringify(link.paths) : null,
  tools: link.tools ? JSON.stringify(link.tools) : null
});

/** Replaces every service of a hook, in the caller's transaction. */
export const replaceHookServiceLinks = async (tx: Knex, hookId: string, links: THookServiceLinkInsert[]) => {
  try {
    await tx(LINK).where({ hookId }).delete();
    if (links.length) await tx(LINK).insert(links.map((link) => toLinkRow(hookId, link)));
  } catch (error) {
    throw new DatabaseError({ error, name: "Replace agent vault hook services" });
  }
};

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
      links
    }: { projectId: string; sessionId: string; url: string; encryptedSecret: Buffer; links: THookServiceLinkInsert[] },
    tx: Knex
  ): Promise<TAgentVaultHookRow> => {
    try {
      const [row] = (await tx(TableName.AgentVaultHook)
        .insert({ projectId, sessionId, url, encryptedSecret, appliesToAllServices: links.length === 0 })
        .returning(HOOK_COLUMNS)) as TAgentVaultHookRow[];
      await replaceHookServiceLinks(tx, row.id, links);
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create agent vault session inline hook" });
    }
  };

  // Locked with the hook row already held, so an edit of the whole rule list and an edit of one link apply in turn.
  const lockHookServiceLink = async (
    { hookId, serviceId }: { hookId: string; serviceId: string },
    tx: Knex
  ): Promise<THookServiceLink | undefined> => {
    try {
      return (await tx(LINK)
        .join(SERVICE, `${SERVICE}.id`, `${LINK}.serviceId`)
        .where(`${LINK}.hookId`, hookId)
        .where(`${LINK}.serviceId`, serviceId)
        .forUpdate(LINK)
        .first(linkColumns(tx))) as THookServiceLink | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault hook service" });
    }
  };

  const countHookServiceLinks = async (hookId: string, tx: Knex) => {
    try {
      const row = (await tx(LINK).where({ hookId }).count(`${LINK}.hookId as count`).first()) as
        | { count: string }
        | undefined;
      return parseInt(row?.count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count agent vault hook services" });
    }
  };

  // Appended after the hook's last rule. The hook row is locked, so two adds can't take the same position.
  const insertHookServiceLink = async (
    { hookId, link }: { hookId: string; link: Omit<THookServiceLinkInsert, "position"> },
    tx: Knex
  ) => {
    try {
      const last = (await tx(LINK).where({ hookId }).max("position as position").first()) as
        | { position: number | null }
        | undefined;
      const position = last?.position === null || last?.position === undefined ? 0 : last.position + 1;
      await tx(LINK).insert(toLinkRow(hookId, { ...link, position }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Add agent vault hook service" });
    }
  };

  const updateHookServiceLink = async (
    {
      hookId,
      serviceId,
      link
    }: { hookId: string; serviceId: string; link: Omit<THookServiceLinkInsert, "position" | "serviceId"> },
    tx: Knex
  ) => {
    try {
      const { methods, paths, tools } = toLinkRow(hookId, { ...link, serviceId, position: 0 });
      await tx(LINK).where({ hookId, serviceId }).update({ methods, paths, tools });
    } catch (error) {
      throw new DatabaseError({ error, name: "Update agent vault hook service" });
    }
  };

  const deleteHookServiceLink = async ({ hookId, serviceId }: { hookId: string; serviceId: string }, tx: Knex) => {
    try {
      await tx(LINK).where({ hookId, serviceId }).delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Remove agent vault hook service" });
    }
  };

  // The saved hooks a service is in, by name, with this service's narrowing in each.
  const findSavedHooksOfService = async (
    { serviceId, projectId }: { serviceId: string; projectId: string },
    tx?: Knex
  ): Promise<{ id: string; name: string; methods: unknown; paths: unknown; tools: unknown }[]> => {
    try {
      return (await savedHooks(tx || db)
        .join(LINK, `${LINK}.hookId`, `${TableName.AgentVaultHook}.id`)
        .where(`${LINK}.serviceId`, serviceId)
        .where(`${TableName.AgentVaultHook}.projectId`, projectId)
        .orderBy(`${TableName.AgentVaultHook}.name`, "asc")
        .select(
          `${TableName.AgentVaultHook}.id`,
          `${TableName.AgentVaultHook}.name`,
          `${LINK}.methods`,
          `${LINK}.paths`,
          `${LINK}.tools`
        )) as { id: string; name: string; methods: unknown; paths: unknown; tools: unknown }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault hooks of a service" });
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
    lockHookServiceLink,
    countHookServiceLinks,
    insertHookServiceLink,
    updateHookServiceLink,
    deleteHookServiceLink,
    findSavedHooksOfService,
    findHookServiceLinks: (hookIds: string[], tx?: Knex) => findHookServiceLinks(tx || db, hookIds),
    lockProjectServicesForHook: (scope: { projectId: string; names: string[] }, tx: Knex) =>
      lockProjectServicesForHook(tx, scope),
    replaceHookServiceLinks: (hookId: string, links: THookServiceLinkInsert[], tx: Knex) =>
      replaceHookServiceLinks(tx, hookId, links)
  };
};
