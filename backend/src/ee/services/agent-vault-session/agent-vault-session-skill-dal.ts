import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultSessionSkillDALFactory = ReturnType<typeof agentVaultSessionSkillDALFactory>;

export type TAgentVaultSessionProjectSkillRow = {
  sessionId: string;
  id: string;
  name: string;
  description: string;
  position: number;
};

export const agentVaultSessionSkillDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultSessionSkill);

  // The project skills each session names, as they are named now. A deleted skill is gone from the list.
  const findSummariesBySessionIds = async (
    sessionIds: string[],
    tx?: Knex
  ): Promise<TAgentVaultSessionProjectSkillRow[]> => {
    if (!sessionIds.length) return [];
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultSessionSkill)
        .join(
          TableName.AgentVaultSkill,
          `${TableName.AgentVaultSkill}.id`,
          `${TableName.AgentVaultSessionSkill}.skillId`
        )
        .whereIn(`${TableName.AgentVaultSessionSkill}.sessionId`, sessionIds)
        .whereNull(`${TableName.AgentVaultSkill}.sessionId`)
        .select(
          db.ref("sessionId").withSchema(TableName.AgentVaultSessionSkill),
          db.ref("id").withSchema(TableName.AgentVaultSkill),
          db.ref("name").withSchema(TableName.AgentVaultSkill),
          db.ref("description").withSchema(TableName.AgentVaultSkill),
          db.ref("position").withSchema(TableName.AgentVaultSessionSkill)
        )
        .orderBy(`${TableName.AgentVaultSessionSkill}.position`, "asc")) as TAgentVaultSessionProjectSkillRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session project skills" });
    }
  };

  return { ...orm, findSummariesBySessionIds };
};
