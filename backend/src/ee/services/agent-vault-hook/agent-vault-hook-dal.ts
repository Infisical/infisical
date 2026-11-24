import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultHooks } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify } from "@app/lib/knex";

import { NO_SERVICE_HOOK } from "./agent-vault-hook-fns";
import { THookServiceRef } from "./agent-vault-hook-types";

export type TAgentVaultHookDALFactory = ReturnType<typeof agentVaultHookDALFactory>;

// A hook as every read returns it: never with its secret.
export type TAgentVaultHookRow = Omit<TAgentVaultHooks, "encryptedSecret">;

const HOOK = TableName.AgentVaultHook;
const SERVICE = TableName.AgentVaultService;

const HOOK_COLUMNS = ["id", "projectId", "name", "description", "url", "createdAt", "updatedAt"] as const;

const hookColumns = HOOK_COLUMNS.map((column) => `${HOOK}.${column}`);

/**
 * A service row (a project's, or one sent inline with a session) points at at most one hook through hookId.
 *
 * Lock order is service rows, then the hook: a service write locks its row and then takes the hook FOR KEY SHARE, and a
 * hook delete locks the services using it before the hook, so neither can wait on the other in reverse.
 */
export const agentVaultHookDALFactory = (db: TDbClient) => {
  const orm = ormify(db, HOOK);

  // Reads the primary even without a tx, so a hook created or edited a moment ago is listed as it now is.
  const findForList = async (
    { projectId, search, limit, offset }: { projectId: string; search?: string; limit: number; offset: number },
    tx?: Knex
  ): Promise<{ hooks: TAgentVaultHookRow[]; totalCount: number }> => {
    try {
      const conn = tx || db;
      const applyFilters = (query: Knex.QueryBuilder) => {
        void query.where(`${HOOK}.projectId`, projectId);
        if (search) {
          const term = `%${sanitizeSqlLikeString(search)}%`;
          void query.where((qb) => {
            void qb.orWhereILike(`${HOOK}.name`, term).orWhereILike(`${HOOK}.url`, term);
          });
        }
        return query;
      };

      const [countResult, rows] = await Promise.all([
        applyFilters(conn(HOOK)).count(`${HOOK}.id as count`).first() as Promise<{ count: string } | undefined>,
        applyFilters(conn(HOOK))
          .select(hookColumns)
          .orderBy(`${HOOK}.name`, "asc")
          .limit(limit)
          .offset(offset) as Promise<TAgentVaultHookRow[]>
      ]);
      return { hooks: rows, totalCount: parseInt(countResult?.count || "0", 10) };
    } catch (error) {
      throw new DatabaseError({ error, name: "List agent vault hooks" });
    }
  };

  const findByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx?: Knex
  ): Promise<TAgentVaultHookRow | undefined> => {
    try {
      return (await (tx || db)(HOOK).where({ id, projectId }).first(hookColumns)) as TAgentVaultHookRow | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault hook" });
    }
  };

  // Taken by an update and a delete, so an update racing a delete gets a 404 and two updates apply one after the other.
  const lockByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx: Knex
  ): Promise<TAgentVaultHookRow | undefined> => {
    try {
      return (await tx(HOOK).where({ id, projectId }).forUpdate().first(hookColumns)) as TAgentVaultHookRow | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault hook" });
    }
  };

  const findByNameInProject = async (
    { name, projectId, excludeId }: { name: string; projectId: string; excludeId?: string },
    tx?: Knex
  ): Promise<TAgentVaultHookRow | undefined> => {
    try {
      const query = (tx || db)(HOOK)
        .where(`${HOOK}.projectId`, projectId)
        .whereRaw(`lower(??) = lower(?)`, [`${HOOK}.name`, name]);
      if (excludeId) void query.whereNot(`${HOOK}.id`, excludeId);
      return (await query.first(hookColumns)) as TAgentVaultHookRow | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault hook by name" });
    }
  };

  // FOR KEY SHARE, the lock the service's foreign key takes anyway, held until the service write commits: a delete of
  // the hook waits for it, or wins and this reads the hook as missing instead of the write failing on the key.
  const findByNameForService = async (
    { name, projectId }: { name: string; projectId: string },
    tx: Knex
  ): Promise<TAgentVaultHookRow | undefined> => {
    try {
      return (await tx(HOOK)
        .where(`${HOOK}.projectId`, projectId)
        .whereRaw(`lower(??) = lower(?)`, [`${HOOK}.name`, name])
        .forKeyShare()
        .first(hookColumns)) as TAgentVaultHookRow | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault hook for a service" });
    }
  };

  // The same lock for several hooks at once, in ID order, for a session whose inline services name them.
  const findByNamesForService = async (
    { names, projectId }: { names: string[]; projectId: string },
    tx: Knex
  ): Promise<TAgentVaultHookRow[]> => {
    if (!names.length) return [];
    try {
      return (await tx(HOOK)
        .where(`${HOOK}.projectId`, projectId)
        .whereRaw(`lower(??) = ANY(?)`, [`${HOOK}.name`, [...new Set(names.map((name) => name.toLowerCase()))]])
        .orderBy(`${HOOK}.id`, "asc")
        .forKeyShare()
        .select(hookColumns)) as TAgentVaultHookRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault hooks for a session" });
    }
  };

  /** The project's services using each hook, by name: only those in accessBundleIds, or every one when it's null. */
  const findUsedBy = async (
    hookIds: string[],
    accessBundleIds: string[] | null,
    tx?: Knex
  ): Promise<Map<string, THookServiceRef[]>> => {
    const usedBy = new Map<string, THookServiceRef[]>();
    if (!hookIds.length || accessBundleIds?.length === 0) return usedBy;
    try {
      const query = (tx || db)(SERVICE).whereIn("hookId", hookIds).whereNull("sessionId");
      if (accessBundleIds) {
        void query.whereExists((qb) => {
          void qb
            .select(db.raw("1"))
            .from(TableName.AgentVaultAccessBundleService)
            .whereRaw(`??."serviceId" = ??.id`, [TableName.AgentVaultAccessBundleService, SERVICE])
            .whereIn(`${TableName.AgentVaultAccessBundleService}.accessBundleId`, accessBundleIds);
        });
      }
      const rows = (await query
        .orderBy("name", "asc")
        .select("id", "name", "type", "hostPattern", "hookId")) as (THookServiceRef & {
        hookId: string;
      })[];
      rows.forEach(({ hookId, ...service }) => usedBy.set(hookId, [...(usedBy.get(hookId) ?? []), service]));
      return usedBy;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault services using hooks" });
    }
  };

  const findNamesByIds = async (
    { ids, projectId }: { ids: string[]; projectId: string },
    tx?: Knex
  ): Promise<Map<string, string>> => {
    if (!ids.length) return new Map();
    try {
      const rows = (await (tx || db)(HOOK)
        .where({ projectId })
        .whereIn("id", [...new Set(ids)])
        .select("id", "name")) as { id: string; name: string }[];
      return new Map(rows.map((row) => [row.id, row.name]));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault hook names" });
    }
  };

  // In ID order and before the hook itself (see the lock order above). FOR NO KEY UPDATE, since only the hook columns
  // change, so a session mint holding a service FOR KEY SHARE isn't blocked.
  const lockServicesUsingHook = async (
    { hookId, projectId }: { hookId: string; projectId: string },
    tx: Knex
  ): Promise<THookServiceRef[]> => {
    try {
      return (await tx(SERVICE)
        .where({ hookId, projectId })
        .whereNull("sessionId")
        .orderBy("id", "asc")
        .forNoKeyUpdate()
        .select("id", "name", "type", "hostPattern")) as THookServiceRef[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault services using a hook" });
    }
  };

  // The project's services only. A session's inline services lose the hook through the foreign key, which leaves their
  // narrowing behind; nothing reads narrowing without a hookId.
  const detachFromServices = async (serviceIds: string[], tx: Knex) => {
    if (!serviceIds.length) return;
    try {
      await tx(SERVICE).whereIn("id", serviceIds).update(NO_SERVICE_HOOK);
    } catch (error) {
      throw new DatabaseError({ error, name: "Remove agent vault hook from services" });
    }
  };

  return {
    ...orm,
    findForList,
    findByIdInProject,
    lockByIdInProject,
    findByNameInProject,
    findByNameForService,
    findByNamesForService,
    findUsedBy,
    findNamesByIds,
    lockServicesUsingHook,
    detachFromServices
  };
};
