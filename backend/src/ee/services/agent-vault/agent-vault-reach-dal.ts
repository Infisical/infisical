import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TAgentVaultReachDALFactory = ReturnType<typeof agentVaultReachDALFactory>;

// The ids a role's conditions are checked against. Read on the primary: a bundle, service or skill created a moment
// before must count at once, or a role covering every one of them except some would refuse it.
export const agentVaultReachDALFactory = (db: TDbClient) => {
  const findAccessBundleIds = async (projectId: string, tx?: Knex): Promise<string[]> => {
    try {
      const rows = (await (tx || db)(TableName.AgentVaultAccessBundle).where({ projectId }).select("id")) as {
        id: string;
      }[];
      return rows.map((row) => row.id);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault access bundle ids" });
    }
  };

  // The project's own services, never one sent with a session.
  const findServiceIds = async (projectId: string, tx?: Knex): Promise<string[]> => {
    try {
      const rows = (await (tx || db)(TableName.AgentVaultService)
        .where({ projectId })
        .whereNull("sessionId")
        .select("id")) as { id: string }[];
      return rows.map((row) => row.id);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service ids" });
    }
  };

  // The project's own skills, never one sent with a session.
  const findSkillIds = async (projectId: string, tx?: Knex): Promise<string[]> => {
    try {
      const rows = (await (tx || db)(TableName.AgentVaultSkill)
        .where({ projectId })
        .whereNull("sessionId")
        .select("id")) as { id: string }[];
      return rows.map((row) => row.id);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault skill ids" });
    }
  };

  // Every service some bundle in the project holds.
  const findServiceIdsInAnyBundle = async (projectId: string, tx?: Knex): Promise<string[]> => {
    try {
      const rows = (await (tx || db)(TableName.AgentVaultAccessBundleService)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultAccessBundle}.id`,
          `${TableName.AgentVaultAccessBundleService}.accessBundleId`
        )
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .distinct(`${TableName.AgentVaultAccessBundleService}.serviceId`)) as { serviceId: string }[];
      return rows.map((row) => row.serviceId);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault services in any access bundle" });
    }
  };

  // Every skill some bundle in the project holds.
  const findSkillIdsInAnyBundle = async (projectId: string, tx?: Knex): Promise<string[]> => {
    try {
      const rows = (await (tx || db)(TableName.AgentVaultAccessBundleSkill)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultAccessBundle}.id`,
          `${TableName.AgentVaultAccessBundleSkill}.accessBundleId`
        )
        .where(`${TableName.AgentVaultAccessBundle}.projectId`, projectId)
        .distinct(`${TableName.AgentVaultAccessBundleSkill}.skillId`)) as { skillId: string }[];
      return rows.map((row) => row.skillId);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault skills in any access bundle" });
    }
  };

  return { findAccessBundleIds, findServiceIds, findSkillIds, findServiceIdsInAnyBundle, findSkillIdsInAnyBundle };
};
