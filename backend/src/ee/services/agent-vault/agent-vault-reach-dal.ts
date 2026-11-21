import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { isUuidV4 } from "@app/lib/validator/validate-uuid";

export type TAgentVaultReachDALFactory = ReturnType<typeof agentVaultReachDALFactory>;

// A role names ids by uuid, but one a role names may not be a row in this project. onlyIds narrows a lookup to the ids
// a role names, so a role that names a few doesn't load the project's whole list; one that isn't a uuid matches nothing.
const narrowTo = (query: Knex.QueryBuilder, onlyIds: string[] | undefined) => {
  if (onlyIds) void query.whereIn("id", onlyIds.filter(isUuidV4));
  return query;
};

// The ids a role's conditions are checked against. Read on the primary: a bundle, service or skill created a moment
// before must count at once, or a role covering every one of them except some would refuse it.
export const agentVaultReachDALFactory = (db: TDbClient) => {
  const findAccessBundleIds = async (projectId: string, tx?: Knex, onlyIds?: string[]): Promise<string[]> => {
    if (onlyIds && !onlyIds.length) return [];
    try {
      const rows = (await narrowTo((tx || db)(TableName.AgentVaultAccessBundle).where({ projectId }), onlyIds).select(
        "id"
      )) as { id: string }[];
      return rows.map((row) => row.id);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault access bundle ids" });
    }
  };

  // The project's own services, never one sent with a session.
  const findServiceIds = async (projectId: string, tx?: Knex, onlyIds?: string[]): Promise<string[]> => {
    if (onlyIds && !onlyIds.length) return [];
    try {
      const rows = (await narrowTo(
        (tx || db)(TableName.AgentVaultService).where({ projectId }).whereNull("sessionId"),
        onlyIds
      ).select("id")) as { id: string }[];
      return rows.map((row) => row.id);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service ids" });
    }
  };

  // The project's own skills, never one sent with a session.
  const findSkillIds = async (projectId: string, tx?: Knex, onlyIds?: string[]): Promise<string[]> => {
    if (onlyIds && !onlyIds.length) return [];
    try {
      const rows = (await narrowTo(
        (tx || db)(TableName.AgentVaultSkill).where({ projectId }).whereNull("sessionId"),
        onlyIds
      ).select("id")) as { id: string }[];
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
