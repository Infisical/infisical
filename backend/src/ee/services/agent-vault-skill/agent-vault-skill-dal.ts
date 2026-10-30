import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultSkills } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify } from "@app/lib/knex";

export type TAgentVaultSkillDALFactory = ReturnType<typeof agentVaultSkillDALFactory>;

export type TAgentVaultSkillSummaryRow = TAgentVaultSkills & { latestVersion: number };

type TSummaryQueryRow = TAgentVaultSkills & { latestVersion: number | string };

const SKILL_COLUMNS = ["id", "projectId", "name", "description", "createdAt", "updatedAt"] as const;

export const agentVaultSkillDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultSkill);

  const columns = SKILL_COLUMNS.map((column) => `${TableName.AgentVaultSkill}.${column}`);

  const summaryQuery = (conn: Knex) =>
    conn(TableName.AgentVaultSkill).select(
      ...columns,
      db.raw(`(SELECT MAX(v."version") FROM ?? v WHERE v."skillId" = ??.id) AS "latestVersion"`, [
        TableName.AgentVaultSkillVersion,
        TableName.AgentVaultSkill
      ])
    );

  const toSummary = (row: TSummaryQueryRow): TAgentVaultSkillSummaryRow => ({
    ...row,
    latestVersion: Number(row.latestVersion)
  });

  // Reads the primary even without a tx, so a skill created or published a moment ago is listed as it now is.
  // accessBundleIds null lists every skill; otherwise only skills in one of those bundles.
  const findForList = async (
    {
      projectId,
      accessBundleIds,
      search,
      name,
      limit,
      offset
    }: {
      projectId: string;
      accessBundleIds: string[] | null;
      search?: string;
      name?: string;
      limit: number;
      offset: number;
    },
    tx?: Knex
  ): Promise<{ skills: TAgentVaultSkillSummaryRow[]; totalCount: number }> => {
    if (accessBundleIds?.length === 0) return { skills: [], totalCount: 0 };

    try {
      const conn = tx || db;
      const applyFilters = (query: Knex.QueryBuilder) => {
        void query.where(`${TableName.AgentVaultSkill}.projectId`, projectId);
        if (accessBundleIds) {
          void query.whereExists(
            conn(TableName.AgentVaultAccessBundleSkill)
              .select(db.raw("1"))
              .whereRaw(`??."skillId" = ??.id`, [TableName.AgentVaultAccessBundleSkill, TableName.AgentVaultSkill])
              .whereIn(`${TableName.AgentVaultAccessBundleSkill}.accessBundleId`, accessBundleIds)
          );
        }
        if (name !== undefined) void query.where(`${TableName.AgentVaultSkill}.name`, name);
        if (search) {
          const term = `%${sanitizeSqlLikeString(search)}%`;
          void query.where((qb) => {
            void qb
              .orWhereILike(`${TableName.AgentVaultSkill}.name`, term)
              .orWhereILike(`${TableName.AgentVaultSkill}.description`, term);
          });
        }
        return query;
      };

      const [countResult, rows] = await Promise.all([
        applyFilters(conn(TableName.AgentVaultSkill))
          .count(`${TableName.AgentVaultSkill}.id as count`)
          .first() as Promise<{ count: string } | undefined>,
        applyFilters(summaryQuery(conn))
          .orderBy(`${TableName.AgentVaultSkill}.name`, "asc")
          .limit(limit)
          .offset(offset) as Promise<TSummaryQueryRow[]>
      ]);
      return { skills: rows.map(toSummary), totalCount: parseInt(countResult?.count || "0", 10) };
    } catch (error) {
      throw new DatabaseError({ error, name: "List agent vault skills" });
    }
  };

  const findSummaryByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx?: Knex
  ): Promise<TAgentVaultSkillSummaryRow | undefined> => {
    try {
      const row = (await summaryQuery(tx || db)
        .where(`${TableName.AgentVaultSkill}.id`, id)
        .where(`${TableName.AgentVaultSkill}.projectId`, projectId)
        .first()) as TSummaryQueryRow | undefined;
      return row ? toSummary(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault skill" });
    }
  };

  const findByNameInProject = async (
    { name, projectId }: { name: string; projectId: string },
    tx?: Knex
  ): Promise<TAgentVaultSkills | undefined> => {
    try {
      return (await (tx || db)(TableName.AgentVaultSkill).where({ name, projectId }).first(columns)) as
        | TAgentVaultSkills
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault skill by name" });
    }
  };

  const countInProject = async (projectId: string, tx?: Knex): Promise<number> => {
    try {
      const result = (await (tx || db)(TableName.AgentVaultSkill).where({ projectId }).count("id as count").first()) as
        | { count: string | number }
        | undefined;
      return Number(result?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count agent vault skills" });
    }
  };

  // Taken by a delete, by a publish or restore, and by an add so a skill being deleted can't gain a bundle on
  // its way out.
  const lockByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx: Knex
  ): Promise<TAgentVaultSkills | undefined> => {
    try {
      return (await tx(TableName.AgentVaultSkill).where({ id, projectId }).forUpdate().first(columns)) as
        | TAgentVaultSkills
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Lock agent vault skill" });
    }
  };

  return { ...orm, findForList, findSummaryByIdInProject, findByNameInProject, countInProject, lockByIdInProject };
};
