import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultVariables } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultVariableDALFactory = ReturnType<typeof agentVaultVariableDALFactory>;

// accessBundleId is left over from bundle-scoped variables and no longer read, so it stays off every row.
export type TAgentVaultVariable = Omit<TAgentVaultVariables, "accessBundleId">;

export type TAgentVaultVariableValueRow = Pick<TAgentVaultVariables, "id" | "encryptedValue">;

export type TAgentVaultVariableUser = {
  variableId: string;
  serviceId: string;
  serviceName: string;
  hostPattern: string;
  accessBundleId: string;
  accessBundleName: string;
};

const VARIABLE_COLUMNS = ["id", "projectId", "key", "encryptedValue", "createdAt", "updatedAt"] as const;

export const agentVaultVariableDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultVariable);

  const columns = VARIABLE_COLUMNS.map((column) => `${TableName.AgentVaultVariable}.${column}`);

  // Reads the primary even without a tx, so a variable created a moment ago is always listed.
  const findByProjectId = async (projectId: string, tx?: Knex): Promise<TAgentVaultVariable[]> => {
    try {
      return (await (tx || db)(TableName.AgentVaultVariable)
        .where({ projectId })
        .orderBy("key", "asc")
        .select(columns)) as TAgentVaultVariable[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variables" });
    }
  };

  // Reads the primary even without a tx, so a key created a moment ago is always found.
  const findKeysByProjectId = async (
    projectId: string,
    tx?: Knex
  ): Promise<Pick<TAgentVaultVariables, "id" | "key">[]> => {
    try {
      return await (tx || db)(TableName.AgentVaultVariable).where({ projectId }).select("id", "key");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable keys" });
    }
  };

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

  const findByKeyInProject = async (
    { key, projectId }: { key: string; projectId: string },
    tx?: Knex
  ): Promise<TAgentVaultVariable | undefined> => {
    try {
      return (await (tx || db)(TableName.AgentVaultVariable).where({ key, projectId }).first(columns)) as
        | TAgentVaultVariable
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable by key" });
    }
  };

  // Taken by a variable delete, update or rename. A service save takes the same rows FOR SHARE, so a delete waits for
  // a save that is adding a reference, then sees it.
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
    { variableIds, projectId }: { variableIds: string[]; projectId: string },
    tx: Knex
  ): Promise<string[]> => {
    if (!variableIds.length) return [];
    try {
      const rows = await tx(TableName.AgentVaultVariable)
        .where({ projectId })
        .whereIn("id", variableIds)
        .orderBy("id")
        .forShare()
        .select("id");
      return rows.map((row) => row.id);
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault variables for reference" });
    }
  };

  // Reads the primary even without a tx, so a service saved a moment ago shows as using its variables.
  const findUsers = async (variableIds: string[], tx?: Knex): Promise<TAgentVaultVariableUser[]> => {
    if (!variableIds.length) return [];
    try {
      return (await (tx || db)(TableName.AgentVaultServiceVariableReference)
        .join(
          TableName.AgentVaultService,
          `${TableName.AgentVaultServiceVariableReference}.serviceId`,
          `${TableName.AgentVaultService}.id`
        )
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultService}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .whereIn(`${TableName.AgentVaultServiceVariableReference}.variableId`, variableIds)
        .distinct(
          db.ref("variableId").withSchema(TableName.AgentVaultServiceVariableReference),
          db.ref("id").withSchema(TableName.AgentVaultService).as("serviceId"),
          db.ref("name").withSchema(TableName.AgentVaultService).as("serviceName"),
          db.ref("hostPattern").withSchema(TableName.AgentVaultService),
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleId"),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName")
        )
        .orderBy([
          { column: "accessBundleName", order: "asc" },
          { column: "serviceName", order: "asc" }
        ])) as TAgentVaultVariableUser[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable users" });
    }
  };

  // Resolve is the hot path, so it reads a replica. A variable is always saved before any service that uses it,
  // but each query picks its own replica, and the one serving this read can trail the one that served the
  // service. So an id the replica does not have is asked of the primary before resolve gives up on it.
  const findValuesForResolve = async ({
    variableIds,
    projectId
  }: {
    variableIds: string[];
    projectId: string;
  }): Promise<TAgentVaultVariableValueRow[]> => {
    if (!variableIds.length) return [];
    const read = async (conn: Knex, ids: string[]): Promise<TAgentVaultVariableValueRow[]> =>
      conn(TableName.AgentVaultVariable)
        .whereIn("id", ids)
        .where("projectId", projectId)
        .select("id", "encryptedValue");
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
    findByProjectId,
    findKeysByProjectId,
    findByIdInProject,
    findByKeyInProject,
    lockByIdInProject,
    lockForReference,
    findUsers,
    findValuesForResolve
  };
};
