import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TAgentVaultBundleSkill, TAgentVaultSkillBundleRef } from "./agent-vault-skill-types";

export type TAgentVaultSkillBundleDALFactory = ReturnType<typeof agentVaultSkillBundleDALFactory>;

export const agentVaultSkillBundleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultAccessBundleSkill);

  // Reads the primary even without a tx, so a skill added a moment ago is listed.
  const findSkillsForBundle = async (accessBundleId: string, tx?: Knex): Promise<TAgentVaultBundleSkill[]> => {
    try {
      const rows = (await (tx || db)(TableName.AgentVaultAccessBundleSkill)
        .join(
          TableName.AgentVaultSkill,
          `${TableName.AgentVaultAccessBundleSkill}.skillId`,
          `${TableName.AgentVaultSkill}.id`
        )
        .where(`${TableName.AgentVaultAccessBundleSkill}.accessBundleId`, accessBundleId)
        .select(
          db.ref("id").withSchema(TableName.AgentVaultSkill),
          db.ref("name").withSchema(TableName.AgentVaultSkill),
          db.ref("description").withSchema(TableName.AgentVaultSkill),
          db.raw(`(SELECT MAX(v."version") FROM ?? v WHERE v."skillId" = ??.id) AS "latestVersion"`, [
            TableName.AgentVaultSkillVersion,
            TableName.AgentVaultSkill
          ])
        )
        .orderBy(`${TableName.AgentVaultSkill}.name`, "asc")) as unknown as (Omit<
        TAgentVaultBundleSkill,
        "latestVersion"
      > & { latestVersion: number | string })[];
      return rows.map((row) => ({ ...row, latestVersion: Number(row.latestVersion) }));
    } catch (error) {
      throw new DatabaseError({ error, name: "List agent vault access bundle skills" });
    }
  };

  // accessBundleIds null returns every bundle; otherwise only those of them the skill is in.
  const findBundlesForSkill = async (
    skillId: string,
    accessBundleIds: string[] | null,
    tx?: Knex
  ): Promise<TAgentVaultSkillBundleRef[]> => {
    if (accessBundleIds?.length === 0) return [];
    try {
      const query = (tx || db)(TableName.AgentVaultAccessBundleSkill)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultAccessBundleSkill}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .where(`${TableName.AgentVaultAccessBundleSkill}.skillId`, skillId);
      if (accessBundleIds)
        void query.whereIn(`${TableName.AgentVaultAccessBundleSkill}.accessBundleId`, accessBundleIds);
      return (await query
        .select(
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle)
        )
        .orderBy(`${TableName.AgentVaultAccessBundle}.name`, "asc")) as TAgentVaultSkillBundleRef[];
    } catch (error) {
      throw new DatabaseError({ error, name: "List agent vault skill access bundles" });
    }
  };

  // Reads the primary even without a tx, so a bundle added a moment ago is listed. accessBundleIds null returns
  // every bundle; otherwise only those of them.
  const findBundlesForSkills = async (
    skillIds: string[],
    accessBundleIds: string[] | null,
    tx?: Knex
  ): Promise<Map<string, TAgentVaultSkillBundleRef[]>> => {
    const bundlesBySkill = new Map<string, TAgentVaultSkillBundleRef[]>();
    if (!skillIds.length || accessBundleIds?.length === 0) return bundlesBySkill;
    try {
      const query = (tx || db)(TableName.AgentVaultAccessBundleSkill)
        .join(
          TableName.AgentVaultAccessBundle,
          `${TableName.AgentVaultAccessBundleSkill}.accessBundleId`,
          `${TableName.AgentVaultAccessBundle}.id`
        )
        .whereIn(`${TableName.AgentVaultAccessBundleSkill}.skillId`, skillIds);
      if (accessBundleIds)
        void query.whereIn(`${TableName.AgentVaultAccessBundleSkill}.accessBundleId`, accessBundleIds);
      const rows = (await query
        .select(
          db.ref("skillId").withSchema(TableName.AgentVaultAccessBundleSkill),
          db.ref("id").withSchema(TableName.AgentVaultAccessBundle),
          db.ref("name").withSchema(TableName.AgentVaultAccessBundle)
        )
        .orderBy(`${TableName.AgentVaultAccessBundle}.name`, "asc")) as (TAgentVaultSkillBundleRef & {
        skillId: string;
      })[];
      for (const { skillId, id, name } of rows) {
        const bundles = bundlesBySkill.get(skillId);
        if (bundles) bundles.push({ id, name });
        else bundlesBySkill.set(skillId, [{ id, name }]);
      }
      return bundlesBySkill;
    } catch (error) {
      throw new DatabaseError({ error, name: "List agent vault skills' access bundles" });
    }
  };

  const countForBundle = async (accessBundleId: string, tx?: Knex): Promise<number> => {
    try {
      const result = (await (tx || db)(TableName.AgentVaultAccessBundleSkill)
        .where({ accessBundleId })
        .count("skillId as count")
        .first()) as { count: string | number } | undefined;
      return Number(result?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count agent vault access bundle skills" });
    }
  };

  const isSkillReachable = async (skillId: string, accessBundleIds: string[], tx?: Knex): Promise<boolean> => {
    if (!accessBundleIds.length) return false;
    try {
      const row = (await (tx || db)(TableName.AgentVaultAccessBundleSkill)
        .where({ skillId })
        .whereIn("accessBundleId", accessBundleIds)
        .first("skillId")) as { skillId: string } | undefined;
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check agent vault skill reachability" });
    }
  };

  return { ...orm, findSkillsForBundle, isSkillReachable, findBundlesForSkill, findBundlesForSkills, countForBundle };
};
