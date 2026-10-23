import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultVariables } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify } from "@app/lib/knex";

import { TAgentVaultOwner, whereOwner } from "../agent-vault/agent-vault-owner-fns";

export type TAgentVaultVariableDALFactory = ReturnType<typeof agentVaultVariableDALFactory>;

// accessBundleId is left over from bundle-scoped variables and no longer read, so it stays off every row.
export type TAgentVaultVariable = Omit<TAgentVaultVariables, "accessBundleId">;

export type TAgentVaultVariableOrderBy = "key" | "serviceCount";

// `owner: null` is the global variables; an owner is that user's or identity's personal ones. Every read and lock by
// key or for a list names one, so a global lookup never matches a personal key and the other way round. The by-id
// reads take any owner, and the service checks it.
export type TAgentVaultVariableOwnerScope = { projectId: string; owner: TAgentVaultOwner | null };

// Each owner is one scope to list, null the global one: a list can span both for an admin.
export type TFindAgentVaultVariablesDTO = { projectId: string; owners: (TAgentVaultOwner | null)[] } & {
  search?: string;
  keys?: string[];
  // Counts only the services in these bundles toward serviceCount. Omit to count every one.
  accessBundleIds?: string[];
  orderBy: TAgentVaultVariableOrderBy;
  orderDirection: "asc" | "desc";
  limit: number;
  offset: number;
};

export type TAgentVaultVariableValueRow = Pick<TAgentVaultVariables, "id" | "encryptedValue">;

export type TAgentVaultServiceUsingVariable = {
  variableId: string;
  serviceId: string;
  serviceName: string;
  hostPattern: string;
  accessBundleId: string;
  accessBundleName: string;
};

const VARIABLE_COLUMNS = [
  "id",
  "projectId",
  "userId",
  "identityId",
  "key",
  "encryptedValue",
  "createdAt",
  "updatedAt"
] as const;

// Each (variable, service) pair a reference row records: a service's own fields, or a member's value for one.
const referencingServices = (conn: Knex, variableIds?: string[] | Knex.QueryBuilder) => {
  const serviceRefs = conn(TableName.AgentVaultServiceVariableReference).select(
    `${TableName.AgentVaultServiceVariableReference}.variableId`,
    `${TableName.AgentVaultServiceVariableReference}.serviceId`
  );
  const personalValueRefs = conn(TableName.AgentVaultPersonalValueReference)
    .join(
      TableName.AgentVaultPersonalValue,
      `${TableName.AgentVaultPersonalValueReference}.personalValueId`,
      `${TableName.AgentVaultPersonalValue}.id`
    )
    .select(
      `${TableName.AgentVaultPersonalValueReference}.variableId`,
      `${TableName.AgentVaultPersonalValue}.serviceId`
    );
  if (variableIds) {
    void serviceRefs.whereIn(`${TableName.AgentVaultServiceVariableReference}.variableId`, variableIds);
    void personalValueRefs.whereIn(`${TableName.AgentVaultPersonalValueReference}.variableId`, variableIds);
  }
  return serviceRefs.unionAll(personalValueRefs as unknown as typeof serviceRefs);
};

export const agentVaultVariableDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultVariable);

  const columns = VARIABLE_COLUMNS.map((column) => `${TableName.AgentVaultVariable}.${column}`);

  const scoped = (conn: Knex, { projectId, owner }: TAgentVaultVariableOwnerScope) =>
    whereOwner(
      conn(TableName.AgentVaultVariable).where(`${TableName.AgentVaultVariable}.projectId`, projectId),
      TableName.AgentVaultVariable,
      owner
    );

  // Reads the primary even without a tx, so a variable created a moment ago is always listed. serviceCount counts
  // the services that use a variable, each once however many of its fields do.
  const findForList = async (
    {
      projectId,
      owners,
      search,
      keys,
      accessBundleIds,
      orderBy,
      orderDirection,
      limit,
      offset
    }: TFindAgentVaultVariablesDTO,
    tx?: Knex
  ): Promise<{ variables: TAgentVaultVariable[]; totalCount: number }> => {
    try {
      const conn = tx || db;
      if (!owners.length) return { variables: [], totalCount: 0 };
      const listed = () =>
        conn(TableName.AgentVaultVariable)
          .where(`${TableName.AgentVaultVariable}.projectId`, projectId)
          .where((anyOwner) => {
            owners.forEach((owner) => {
              void anyOwner.orWhere((one) => {
                void whereOwner(one, TableName.AgentVaultVariable, owner);
              });
            });
          });

      const applyFilters = (query: Knex.QueryBuilder) => {
        if (search) {
          void query.whereILike(`${TableName.AgentVaultVariable}.key`, `%${sanitizeSqlLikeString(search)}%`);
        }
        if (keys) void query.whereIn(`${TableName.AgentVaultVariable}.key`, keys);
        return query;
      };

      const countResult = (await applyFilters(listed())
        .count(`${TableName.AgentVaultVariable}.id as count`)
        .first()) as { count: string } | undefined;
      const totalCount = parseInt(countResult?.count || "0", 10);

      const pageQuery = applyFilters(listed()).limit(limit).offset(offset).select(columns);

      if (orderBy === "serviceCount") {
        // Counted over this list's variables only; the references tables hold every org's.
        const usageCounts = conn
          .from(referencingServices(conn, listed().select(`${TableName.AgentVaultVariable}.id`)).as("refs"))
          .select("refs.variableId")
          .countDistinct("refs.serviceId as count")
          .groupBy("refs.variableId");
        if (accessBundleIds) {
          void usageCounts
            .join(TableName.AgentVaultService, "refs.serviceId", `${TableName.AgentVaultService}.id`)
            .whereIn(`${TableName.AgentVaultService}.accessBundleId`, accessBundleIds);
        }

        void pageQuery.leftJoin(usageCounts.as("uc"), function joinUsageCount() {
          this.on(db.raw(`uc."variableId" = ??.id`, [TableName.AgentVaultVariable]));
        });
        void pageQuery.orderByRaw(`COALESCE(uc.count, 0) ${orderDirection === "desc" ? "DESC" : "ASC"}`);
        void pageQuery.orderBy(`${TableName.AgentVaultVariable}.key`, "asc");
      } else {
        void pageQuery.orderBy(`${TableName.AgentVaultVariable}.key`, orderDirection);
      }
      // Without a scope, a global and a personal variable can share a key, so pages need a total order.
      void pageQuery.orderBy(`${TableName.AgentVaultVariable}.id`, "asc");

      return { variables: (await pageQuery) as TAgentVaultVariable[], totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "List agent vault variables" });
    }
  };

  // Reads the primary even without a tx, so a key created a moment ago is always found.
  const findKeys = async (
    scope: TAgentVaultVariableOwnerScope,
    tx?: Knex
  ): Promise<Pick<TAgentVaultVariables, "id" | "key">[]> => {
    try {
      return (await scoped(tx || db, scope).select(
        `${TableName.AgentVaultVariable}.id`,
        `${TableName.AgentVaultVariable}.key`
      )) as Pick<TAgentVaultVariables, "id" | "key">[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable keys" });
    }
  };

  // Any owner's. The service decides whether the caller may act on what it finds.
  const findByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx?: Knex
  ): Promise<TAgentVaultVariable | undefined> => {
    try {
      return (await (tx || db)(TableName.AgentVaultVariable).where({ id, projectId }).first(columns)) as
        | TAgentVaultVariable
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable" });
    }
  };

  const findByKey = async (
    { key, ...scope }: TAgentVaultVariableOwnerScope & { key: string },
    tx?: Knex
  ): Promise<TAgentVaultVariable | undefined> => {
    try {
      return (await scoped(tx || db, scope)
        .where(`${TableName.AgentVaultVariable}.key`, key)
        .first(columns)) as TAgentVaultVariable | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable by key" });
    }
  };

  // Taken by a variable delete, update or rename. A save that references variables takes the same rows FOR SHARE, so
  // a delete waits for a save that is adding a reference, then sees it.
  const lockByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx: Knex
  ): Promise<TAgentVaultVariable | undefined> => {
    try {
      return (await tx(TableName.AgentVaultVariable).where({ id, projectId }).forUpdate().first(columns)) as
        | TAgentVaultVariable
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault variable" });
    }
  };

  // Returns the ids that still exist. One missing was deleted after the save looked its key up.
  const lockForReference = async (
    { variableIds, ...scope }: TAgentVaultVariableOwnerScope & { variableIds: string[] },
    tx: Knex
  ): Promise<string[]> => {
    if (!variableIds.length) return [];
    try {
      const rows = (await scoped(tx, scope)
        .whereIn(`${TableName.AgentVaultVariable}.id`, variableIds)
        .orderBy(`${TableName.AgentVaultVariable}.id`)
        .forShare()
        .select(`${TableName.AgentVaultVariable}.id`)) as { id: string }[];
      return rows.map((row) => row.id);
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault variables for reference" });
    }
  };

  // Reads the primary even without a tx, so a service or personal value saved a moment ago shows as using its
  // variables. A global variable is referenced by services, a personal one by its owner's personal values, so each
  // variable only ever appears in one of the two.
  const findServicesUsing = async (variableIds: string[], tx?: Knex): Promise<TAgentVaultServiceUsingVariable[]> => {
    if (!variableIds.length) return [];
    const conn = tx || db;
    try {
      return (await conn
        .from(referencingServices(conn, variableIds).as("refs"))
        .join(TableName.AgentVaultService, "refs.serviceId", `${TableName.AgentVaultService}.id`)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultService}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .distinct(
          db.ref("variableId").withSchema("refs"),
          db.ref("id").withSchema(TableName.AgentVaultService).as("serviceId"),
          db.ref("name").withSchema(TableName.AgentVaultService).as("serviceName"),
          db.ref("hostPattern").withSchema(TableName.AgentVaultService),
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleId"),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName")
        )
        .orderBy([
          { column: "accessBundleName", order: "asc" },
          { column: "serviceName", order: "asc" }
        ])) as TAgentVaultServiceUsingVariable[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find services using agent vault variables" });
    }
  };

  // Resolve is the hot path, so it reads a replica. A variable is always saved before anything that uses it, but each
  // query picks its own replica, and the one serving this read can trail the one that served the service. So an id
  // the replica does not have is asked of the primary before resolve gives up on it.
  const findValuesForResolve = async ({
    variableIds,
    ...scope
  }: TAgentVaultVariableOwnerScope & { variableIds: string[] }): Promise<TAgentVaultVariableValueRow[]> => {
    if (!variableIds.length) return [];
    const read = async (conn: Knex, ids: string[]) =>
      (await scoped(conn, scope)
        .whereIn(`${TableName.AgentVaultVariable}.id`, ids)
        .select(
          `${TableName.AgentVaultVariable}.id`,
          `${TableName.AgentVaultVariable}.encryptedValue`
        )) as TAgentVaultVariableValueRow[];
    try {
      const rows = await read(db.replicaNode(), variableIds);
      const found = new Set(rows.map((row) => row.id));
      const missing = variableIds.filter((id) => !found.has(id));
      return missing.length ? [...rows, ...(await read(db, missing))] : rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable values" });
    }
  };

  return {
    ...orm,
    findForList,
    findKeys,
    findByIdInProject,
    findByKey,
    lockByIdInProject,
    lockForReference,
    findServicesUsing,
    findValuesForResolve
  };
};
