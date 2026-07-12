import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { PamAccessMethod, PamSessionStatus } from "../pam/pam-enums";

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
      .where("accessMethod", PamAccessMethod.Web)
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
      .where("accessMethod", PamAccessMethod.Web)
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

  const terminateSessionById = async (sessionId: string, tx?: Knex) => {
    const [updated] = await (tx || db)(TableName.PamSession)
      .where("id", sessionId)
      .whereIn("status", [PamSessionStatus.Active, PamSessionStatus.Starting])
      .update({ status: PamSessionStatus.Terminated, endedAt: new Date() })
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
      offset,
      limit,
      search,
      status
    }: {
      viewSessionsFolderIds: string[];
      viewSessionsAccountIds: string[];
      offset?: number;
      limit?: number;
      search?: string;
      status?: string;
    },
    tx?: Knex
  ) => {
    // Visibility comes solely from ViewSessions scopes; no scopes means no sessions, and skipping
    // this guard would leave the filter block empty and match every session in the project.
    if (viewSessionsFolderIds.length === 0 && viewSessionsAccountIds.length === 0) {
      return { sessions: [], totalCount: 0 };
    }

    const baseQuery = (tx || db.replicaNode())(TableName.PamSession)
      .leftJoin(TableName.PamAccount, `${TableName.PamAccount}.id`, `${TableName.PamSession}.accountId`)
      .where(`${TableName.PamSession}.projectId`, projectId)
      .where((top) => {
        if (viewSessionsFolderIds.length > 0) {
          void top.orWhereIn(`${TableName.PamAccount}.folderId`, viewSessionsFolderIds);
        }
        if (viewSessionsAccountIds.length > 0) {
          void top.orWhereIn(`${TableName.PamSession}.accountId`, viewSessionsAccountIds);
        }
      });

    if (search) {
      const term = `%${sanitizeSqlLikeString(search)}%`;
      void baseQuery.where((qb) => {
        void qb
          .orWhereILike(`${TableName.PamSession}.accountName`, term)
          .orWhereILike(`${TableName.PamSession}.actorName`, term)
          .orWhereILike(`${TableName.PamSession}.actorEmail`, term)
          .orWhereILike(`${TableName.PamSession}.folderName`, term);
      });
    }

    if (status) {
      void baseQuery.where(`${TableName.PamSession}.status`, status);
    }

    const countQuery = baseQuery
      .clone()
      .clearSelect()
      .count(`${TableName.PamSession}.id as count`)
      .first<{ count: string }>();

    const dataQuery = baseQuery
      .clone()
      .leftJoin(TableName.GatewayV2, `${TableName.GatewayV2}.id`, `${TableName.PamSession}.gatewayId`)
      .select(selectAllTableCols(TableName.PamSession))
      .select(db.ref("folderId").withSchema(TableName.PamAccount).as("folderId"))
      .select(db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"))
      .select(db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId"))
      .orderBy(`${TableName.PamSession}.createdAt`, "desc");

    if (limit) void dataQuery.limit(limit);
    if (offset) void dataQuery.offset(offset);

    const [countResult, sessions] = await Promise.all([countQuery, dataQuery]);

    return { sessions, totalCount: Number(countResult?.count ?? 0) };
  };

  return {
    ...orm,
    findById,
    countActiveWebSessions,
    endExpiredWebSessions,
    endSessionById,
    terminateSessionById,
    activateSession,
    findByProjectId,
    findAccessibleByProjectId
  };
};
