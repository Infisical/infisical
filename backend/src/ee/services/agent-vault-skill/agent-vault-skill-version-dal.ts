import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultSkillVersions } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultSkillVersionDALFactory = ReturnType<typeof agentVaultSkillVersionDALFactory>;

export type TAgentVaultSkillVersionRow = Omit<TAgentVaultSkillVersions, "encryptedFiles">;

const VERSION_COLUMNS = ["id", "skillId", "version", "sha256", "sizeBytes", "fileCount", "createdAt"] as const;

export const agentVaultSkillVersionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultSkillVersion);

  // Reads the primary even without a tx: publish compares against it to skip an unchanged upload, and a replica
  // behind the last publish would write a duplicate.
  const findLatest = async (skillId: string, tx?: Knex): Promise<TAgentVaultSkillVersionRow | undefined> => {
    try {
      return (await (tx || db)(TableName.AgentVaultSkillVersion)
        .where({ skillId })
        .orderBy("version", "desc")
        .first(VERSION_COLUMNS)) as TAgentVaultSkillVersionRow | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find latest agent vault skill version" });
    }
  };

  const findBySkillId = async (skillId: string, tx?: Knex): Promise<TAgentVaultSkillVersionRow[]> => {
    try {
      return (await (tx || db)(TableName.AgentVaultSkillVersion)
        .where({ skillId })
        .orderBy("version", "desc")
        .select(VERSION_COLUMNS)) as TAgentVaultSkillVersionRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "List agent vault skill versions" });
    }
  };

  const findByVersion = async (
    { skillId, version }: { skillId: string; version: number },
    tx?: Knex
  ): Promise<TAgentVaultSkillVersions | undefined> => {
    try {
      return await (tx || db)(TableName.AgentVaultSkillVersion).where({ skillId, version }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault skill version" });
    }
  };

  const deleteOlderThan = async ({ skillId, version }: { skillId: string; version: number }, tx: Knex) => {
    try {
      return await tx(TableName.AgentVaultSkillVersion).where({ skillId }).where("version", "<", version).delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Prune agent vault skill versions" });
    }
  };

  return { ...orm, findLatest, findBySkillId, findByVersion, deleteOlderThan };
};
