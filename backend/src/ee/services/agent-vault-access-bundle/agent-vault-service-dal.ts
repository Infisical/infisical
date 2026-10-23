import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultServices } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultServiceDALFactory = ReturnType<typeof agentVaultServiceDALFactory>;

export const agentVaultServiceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultService);

  const findByAccessBundleId = async (accessBundleId: string, tx?: Knex): Promise<TAgentVaultServices[]> => {
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultService)
        .where({ accessBundleId })
        .orderBy("name", "asc")) as TAgentVaultServices[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault services" });
    }
  };

  // In id order, so two transactions locking the same services queue for them the same way.
  const lockByAccessBundleId = async (accessBundleId: string, tx: Knex): Promise<{ id: string }[]> => {
    try {
      return (await tx(TableName.AgentVaultService)
        .where({ accessBundleId })
        .orderBy("id", "asc")
        .forUpdate()
        .select("id")) as { id: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault services" });
    }
  };

  // Reads the primary even without a tx, so the row is never older than the last committed save.
  const findByIdInAccessBundle = async (
    { id, accessBundleId }: { id: string; accessBundleId: string },
    tx?: Knex
  ): Promise<TAgentVaultServices | undefined> => {
    try {
      return await (tx || db)(TableName.AgentVaultService).where({ id, accessBundleId }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service" });
    }
  };

  // Reads the primary even without a tx, like findByIdInAccessBundle.
  const findByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx?: Knex
  ): Promise<(TAgentVaultServices & { accessBundleName: string }) | undefined> => {
    try {
      return (await (tx || db)(TableName.AgentVaultService)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultService}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .where(`${TableName.AgentVaultService}.id`, id)
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .first(
          `${TableName.AgentVaultService}.*`,
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName")
        )) as (TAgentVaultServices & { accessBundleName: string }) | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service in project" });
    }
  };

  // A personal values save holds this until it commits. A service update writes the row, so it waits for the
  // save, and a save that starts after the update reads the fields the update left.
  const lockForPersonalValues = async (
    id: string,
    tx: Knex
  ): Promise<Pick<TAgentVaultServices, "id" | "credentialType" | "memberProvidedFields"> | undefined> => {
    try {
      return (await tx(TableName.AgentVaultService)
        .where({ id })
        .forShare()
        .first("id", "credentialType", "memberProvidedFields")) as
        | Pick<TAgentVaultServices, "id" | "credentialType" | "memberProvidedFields">
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault service for personal values" });
    }
  };

  return {
    ...orm,
    findByAccessBundleId,
    lockByAccessBundleId,
    findByIdInAccessBundle,
    findByIdInProject,
    lockForPersonalValues
  };
};
