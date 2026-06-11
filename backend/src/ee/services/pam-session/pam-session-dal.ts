import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { PamSessionStatus } from "../pam/pam-enums";

export type TPamSessionDALFactory = ReturnType<typeof pamSessionDALFactory>;

export const pamSessionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamSession);

  const findById = async (id: string, tx?: Knex) => {
    const session = await (tx || db.replicaNode())(TableName.PamSession)
      .leftJoin(TableName.GatewayV2, `${TableName.GatewayV2}.id`, `${TableName.PamSession}.gatewayId`)
      .select(selectAllTableCols(TableName.PamSession))
      .select(db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"))
      .select(db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId"))
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

  const endExpiredWebSessions = async (userId: string, projectId: string, tx?: Knex): Promise<number> => {
    const now = new Date();
    const updatedCount = await (tx || db)(TableName.PamSession)
      .where("userId", userId)
      .where("projectId", projectId)
      .where("accessMethod", "web")
      .whereIn("status", [PamSessionStatus.Active, PamSessionStatus.Starting])
      .where("expiresAt", "<", now)
      .update({ status: PamSessionStatus.Ended, endedAt: now });
    return updatedCount;
  };

  const endSessionById = async (sessionId: string, tx?: Knex) => {
    const [updated] = await (tx || db)(TableName.PamSession)
      .where("id", sessionId)
      .whereIn("status", [PamSessionStatus.Active, PamSessionStatus.Starting])
      .update({ status: PamSessionStatus.Ended, endedAt: new Date() })
      .returning("*");
    return updated;
  };

  const activateSession = async (sessionId: string, tx?: Knex) => {
    const [updated] = await (tx || db)(TableName.PamSession)
      .where("id", sessionId)
      .where("status", PamSessionStatus.Starting)
      .update({ status: PamSessionStatus.Active, startedAt: new Date() })
      .returning("*");
    return updated;
  };

  const findByProjectId = async (projectId: string, tx?: Knex) => {
    const sessions = await (tx || db.replicaNode())(TableName.PamSession)
      .leftJoin(TableName.GatewayV2, `${TableName.GatewayV2}.id`, `${TableName.PamSession}.gatewayId`)
      .select(selectAllTableCols(TableName.PamSession))
      .select(db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"))
      .select(db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId"))
      .where(`${TableName.PamSession}.projectId`, projectId);

    return sessions;
  };

  const findAccessibleByProjectId = async (
    projectId: string,
    {
      viewSessionsFolderIds,
      viewSessionsAccountIds,
      userId
    }: {
      viewSessionsFolderIds: string[];
      viewSessionsAccountIds: string[];
      userId: string;
    },
    tx?: Knex
  ) => {
    const sessions = await (tx || db.replicaNode())(TableName.PamSession)
      .leftJoin(TableName.GatewayV2, `${TableName.GatewayV2}.id`, `${TableName.PamSession}.gatewayId`)
      .leftJoin(TableName.PamAccount, `${TableName.PamAccount}.id`, `${TableName.PamSession}.accountId`)
      .select(selectAllTableCols(TableName.PamSession))
      .select(db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"))
      .select(db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId"))
      .where(`${TableName.PamSession}.projectId`, projectId)
      .where((top) => {
        // actor's own sessions are always included regardless of role
        void top.orWhere(`${TableName.PamSession}.userId`, userId);
        // actor's role grants ViewSessions on these resources, so all sessions are returned
        if (viewSessionsFolderIds.length > 0) {
          void top.orWhereIn(`${TableName.PamAccount}.folderId`, viewSessionsFolderIds);
        }
        if (viewSessionsAccountIds.length > 0) {
          void top.orWhereIn(`${TableName.PamSession}.accountId`, viewSessionsAccountIds);
        }
      });

    return sessions;
  };

  return {
    ...orm,
    findById,
    countActiveWebSessions,
    endExpiredWebSessions,
    endSessionById,
    activateSession,
    findByProjectId,
    findAccessibleByProjectId
  };
};
