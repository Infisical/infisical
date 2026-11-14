import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { AgentVaultServiceType } from "../agent-vault/agent-vault-enums";

export type TAgentVaultSessionServiceDALFactory = ReturnType<typeof agentVaultSessionServiceDALFactory>;

export type TAgentVaultSessionProjectServiceRow = {
  sessionId: string;
  id: string;
  name: string;
  type: AgentVaultServiceType;
  description: string | null;
  hostPattern: string | null;
  position: number;
};

export const agentVaultSessionServiceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultSessionService);

  // The project services each session names, as they are named now. A deleted service is gone from the list.
  const findSummariesBySessionIds = async (
    sessionIds: string[],
    tx?: Knex
  ): Promise<TAgentVaultSessionProjectServiceRow[]> => {
    if (!sessionIds.length) return [];
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultSessionService)
        .join(
          TableName.AgentVaultService,
          `${TableName.AgentVaultService}.id`,
          `${TableName.AgentVaultSessionService}.serviceId`
        )
        .whereIn(`${TableName.AgentVaultSessionService}.sessionId`, sessionIds)
        .select(
          db.ref("sessionId").withSchema(TableName.AgentVaultSessionService),
          db.ref("id").withSchema(TableName.AgentVaultService),
          db.ref("name").withSchema(TableName.AgentVaultService),
          db.ref("type").withSchema(TableName.AgentVaultService),
          db.ref("description").withSchema(TableName.AgentVaultService),
          db.ref("hostPattern").withSchema(TableName.AgentVaultService),
          db.ref("position").withSchema(TableName.AgentVaultSessionService)
        )
        .orderBy(`${TableName.AgentVaultSessionService}.position`, "asc")) as TAgentVaultSessionProjectServiceRow[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session project services" });
    }
  };

  return { ...orm, findSummariesBySessionIds };
};
