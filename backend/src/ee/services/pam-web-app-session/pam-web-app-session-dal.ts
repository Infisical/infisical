import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPamSessions } from "@app/db/schemas";

import {
  PAM_RECORDING_MANIFEST_TABLE,
  PAM_RECORDING_STORAGE_TABLE,
  PAM_WEB_APP_SESSION_TABLE,
  PAM_WEB_APP_TICKET_TABLE,
  TRecordingStorageSnapshot,
  TWebAppRecord,
  TWebAppSession,
  TWebAppTicket,
  TWebRecordingChunkMetadata
} from "./pam-web-app-session-types";

export type TPamWebAppSessionDAL = ReturnType<typeof pamWebAppSessionDALFactory>;
export const pamWebAppSessionDALFactory = (db: TDbClient) => {
  const getRecord = async (sessionId: string, tx?: Knex): Promise<TWebAppRecord | null> => {
    const conn = tx || db;
    const session = (await conn<TPamSessions>(TableName.PamSession)
      .join(TableName.Project, `${TableName.Project}.id`, `${TableName.PamSession}.projectId`)
      .leftJoin(TableName.GatewayV2, `${TableName.GatewayV2}.id`, `${TableName.PamSession}.gatewayId`)
      .select(`${TableName.PamSession}.*`, `${TableName.Project}.orgId`, `${TableName.GatewayV2}.name as gatewayName`)
      .where(`${TableName.PamSession}.id`, sessionId)
      .first()) as TWebAppRecord["session"] | undefined;
    if (!session) return null;
    const web = await conn<TWebAppSession>(PAM_WEB_APP_SESSION_TABLE).where({ sessionId }).first();
    return web ? { session, web } : null;
  };
  const lockRecord = async (sessionId: string, tx: Knex) => {
    await tx(TableName.PamSession).where({ id: sessionId }).forUpdate().first();
    await tx(PAM_WEB_APP_SESSION_TABLE).where({ sessionId }).forUpdate().first();
    return getRecord(sessionId, tx);
  };
  const findLaunch = (userId: string, accountId: string, idempotencyKey: string) =>
    db<TWebAppSession>(PAM_WEB_APP_SESSION_TABLE)
      .where({ createdByUserId: userId, accountId, idempotencyKey })
      .orderBy("createdAt", "desc")
      .first();
  const consumeTicket = async (tokenHash: Buffer, sessionId: string) => {
    const [row] = await db<TWebAppTicket>(PAM_WEB_APP_TICKET_TABLE)
      .where({ tokenHash, sessionId })
      .whereNull("consumedAt")
      .where("expiresAt", ">", new Date())
      .update({ consumedAt: new Date() })
      .returning("*");
    return row;
  };
  const findMine = async (userId: string, projectId: string): Promise<{ sessionId: string }[]> =>
    (await db<TWebAppSession>(PAM_WEB_APP_SESSION_TABLE)
      .join(TableName.PamSession, `${TableName.PamSession}.id`, `${PAM_WEB_APP_SESSION_TABLE}.sessionId`)
      .where({ createdByUserId: userId, projectId })
      .whereNotNull(`${TableName.PamSession}.accountId`)
      .whereNotIn("workerState", ["stopped", "failed"])
      .orderBy(`${PAM_WEB_APP_SESSION_TABLE}.createdAt`, "desc")
      .limit(100)
      .select(`${PAM_WEB_APP_SESSION_TABLE}.sessionId`)) as { sessionId: string }[];
  const getStorage = (sessionId: string, tx?: Knex) =>
    (tx || db)<TRecordingStorageSnapshot>(PAM_RECORDING_STORAGE_TABLE).where({ sessionId }).first();
  const getRecordingChunkMetadata = async (sessionId: string, tx?: Knex): Promise<TWebRecordingChunkMetadata[]> =>
    (await (tx || db)<TWebRecordingChunkMetadata>(TableName.PamSessionEventChunk)
      .where({ sessionId })
      .orderBy("chunkIndex")
      .limit(10001)
      .select(
        "id",
        "sessionId",
        "chunkIndex",
        "startElapsedMs",
        "endElapsedMs",
        "storageBackend",
        "externalChunkObjectKey",
        "externalObjectVersionId",
        "ciphertextSha256",
        "ciphertextBytes",
        "iv",
        "verifiedAt",
        "verifiedSha256",
        (tx || db).raw('"encryptedEventsBlob" IS NOT NULL AS "hasCiphertext"')
      )) as TWebRecordingChunkMetadata[];
  const manifestStatus = async (sessionId: string) =>
    (
      await db<{ sessionId: string; status: "complete" | "incomplete" | "mismatch" }>(PAM_RECORDING_MANIFEST_TABLE)
        .where({ sessionId })
        .first()
    )?.status;
  const countVerified = async (sessionId: string) => {
    const result = await db(TableName.PamSessionEventChunk)
      .where({ sessionId })
      .whereNotNull("verifiedAt")
      .count<{ count: string | number }[]>("id as count")
      .first();
    return Number(result?.count ?? 0);
  };
  return {
    db,
    transaction: <T>(fn: (tx: Knex) => Promise<T>) => db.transaction(fn),
    getRecord,
    lockRecord,
    findLaunch,
    consumeTicket,
    findMine,
    getStorage,
    getRecordingChunkMetadata,
    manifestStatus,
    countVerified
  };
};
