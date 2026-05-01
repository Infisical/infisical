import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { PamSessionStatus } from "./pam-session-enums";

export type TPamSessionDALFactory = ReturnType<typeof pamSessionDALFactory>;
export const pamSessionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamSession);

  const findById = async (id: string, tx?: Knex) => {
    const session = await (tx || db.replicaNode())(TableName.PamSession)
      .leftJoin(TableName.PamAccount, `${TableName.PamSession}.accountId`, `${TableName.PamAccount}.id`)
      .leftJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
      .leftJoin(TableName.GatewayV2, `${TableName.PamResource}.gatewayId`, `${TableName.GatewayV2}.id`)
      .select(selectAllTableCols(TableName.PamSession))
      .select(db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"))
      .select(db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId"))
      .select(db.ref("id").withSchema(TableName.GatewayV2).as("gatewayId"))
      .where(`${TableName.PamSession}.id`, id)
      .first();

    return session;
  };

  const countActiveWebSessions = async (userId: string, projectId: string, tx?: Knex): Promise<number> => {
    const result = await (tx || db.replicaNode())(TableName.PamSession)
      .where("userId", userId)
      .where("projectId", projectId)
      .where("accessMethod", "web")
      .whereIn("status", [PamSessionStatus.Starting, PamSessionStatus.Active])
      .count("id as count")
      .first();

    return Number((result as { count?: string | number })?.count ?? 0);
  };

  const expireSessionById = async (sessionId: string, tx?: Knex) => {
    const now = new Date();

    const updatedCount = await (tx || db)(TableName.PamSession)
      .where("id", sessionId)
      .whereIn("status", [PamSessionStatus.Active, PamSessionStatus.Starting])
      .update({
        status: PamSessionStatus.Ended,
        endedAt: now
      });

    return updatedCount;
  };

  const findByProjectId = async (projectId: string, tx?: Knex) => {
    const sessions = await (tx || db.replicaNode())(TableName.PamSession)
      .leftJoin(TableName.PamAccount, `${TableName.PamSession}.accountId`, `${TableName.PamAccount}.id`)
      .leftJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
      .leftJoin(TableName.GatewayV2, `${TableName.PamResource}.gatewayId`, `${TableName.GatewayV2}.id`)
      .select(selectAllTableCols(TableName.PamSession))
      .select(db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId"))
      .select(db.ref("id").withSchema(TableName.GatewayV2).as("gatewayId"))
      .where(`${TableName.PamSession}.projectId`, projectId);

    return sessions;
  };

  const endSessionById = async (sessionId: string, tx?: Knex) => {
    const [updated] = await (tx || db)(TableName.PamSession)
      .where("id", sessionId)
      .whereIn("status", [PamSessionStatus.Active, PamSessionStatus.Starting])
      .update({ status: PamSessionStatus.Ended, endedAt: new Date() })
      .returning("*");
    return updated;
  };

  const terminateSessionById = async (sessionId: string, tx?: Knex) => {
    const [updated] = await (tx || db)(TableName.PamSession)
      .where("id", sessionId)
      .whereIn("status", [PamSessionStatus.Active, PamSessionStatus.Starting])
      .update({ status: PamSessionStatus.Terminated, endedAt: new Date() })
      .returning("*");
    return updated;
  };

  const countActiveByProject = async (projectId: string, tx?: Knex): Promise<number> => {
    const result = await (tx || db.replicaNode())(TableName.PamSession)
      .where("projectId", projectId)
      .whereIn("status", [PamSessionStatus.Starting, PamSessionStatus.Active])
      .count("id as count")
      .first();

    return Number((result as { count?: string | number })?.count ?? 0);
  };

  const countDailyByProject = async (
    projectId: string,
    startDate: Date,
    tx?: Knex
  ): Promise<{ date: string; count: number }[]> => {
    const rows = (await (tx || db.replicaNode())(TableName.PamSession)
      .select(db.raw(`to_char(("createdAt" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') as date`))
      .count("id as count")
      .where("projectId", projectId)
      .where("createdAt", ">=", startDate)
      .groupByRaw(`("createdAt" AT TIME ZONE 'UTC')::date`)
      .orderByRaw(`("createdAt" AT TIME ZONE 'UTC')::date asc`)) as unknown as {
      date: string;
      count: string | number;
    }[];

    return rows.map((row) => ({ date: String(row.date), count: Number(row.count) }));
  };

  const findTopActorsByProject = async (
    projectId: string,
    startDate: Date,
    limit: number,
    tx?: Knex
  ): Promise<
    {
      actorName: string;
      actorEmail: string;
      userId: string | null;
      sessionCount: number;
    }[]
  > => {
    const rows = (await (tx || db.replicaNode())(TableName.PamSession)
      .select("actorName", "actorEmail", "userId")
      .count("id as count")
      .where("projectId", projectId)
      .where("createdAt", ">=", startDate)
      .groupBy("actorName", "actorEmail", "userId")
      .orderBy("count", "desc")
      .limit(limit)) as unknown as {
      actorName: string;
      actorEmail: string;
      userId: string | null;
      count: string | number;
    }[];

    return rows.map((row) => ({
      actorName: row.actorName,
      actorEmail: row.actorEmail,
      userId: row.userId,
      sessionCount: Number(row.count)
    }));
  };

  return {
    ...orm,
    findById,
    findByProjectId,
    expireSessionById,
    countActiveWebSessions,
    countActiveByProject,
    countDailyByProject,
    findTopActorsByProject,
    endSessionById,
    terminateSessionById
  };
};
