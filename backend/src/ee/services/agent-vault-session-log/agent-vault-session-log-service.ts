import { ForbiddenError } from "@casl/ability";

import { TAgentVaultSessionLogChunks, TAgentVaultSessionLogConfigs } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  BadRequestError,
  ConflictError,
  ForbiddenRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError
} from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import { getAgentVaultPermission } from "../agent-vault/agent-vault-permission";
import { TAgentVaultProxyDALFactory } from "../agent-vault-proxy/agent-vault-proxy-dal";
import { TAgentVaultSessionDALFactory } from "../agent-vault-session/agent-vault-session-dal";
import { isOwnerlessSession, isSessionOwnedBy } from "../agent-vault-session/agent-vault-session-fns";
import { TAgentVaultSessionLogChunkDALFactory } from "./agent-vault-session-log-chunk-dal";
import { TAgentVaultSessionLogConfigDALFactory } from "./agent-vault-session-log-config-dal";
import {
  AGENT_VAULT_SESSION_LOG_CLOCK_SKEW_MS,
  AGENT_VAULT_SESSION_LOG_LATE_CHUNK_GRACE_MS,
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_AGE_MS,
  AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES,
  AGENT_VAULT_SESSION_LOG_MAX_PAGE_CHUNKS,
  AGENT_VAULT_SESSION_LOG_MAX_STORED_CHUNKS,
  AGENT_VAULT_SESSION_LOG_MIN_BYTES_PER_RECORD,
  AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS,
  AGENT_VAULT_SESSION_LOG_RECEIVE_OVERLAP_MS,
  AGENT_VAULT_SESSION_LOG_STORAGE_CACHE_MS
} from "./agent-vault-session-log-constants";
import {
  AgentVaultSessionLogErrorName,
  AgentVaultSessionLogStorageUnavailableReason
} from "./agent-vault-session-log-enums";
import {
  buildSessionLogObjectKey,
  encodeHistoryCursor,
  encodeTailCursor,
  isSessionLogIngestEnabled,
  resolveStorageConfig
} from "./agent-vault-session-log-fns";
import { unwrapSessionLogKey } from "./agent-vault-session-log-secrets";
import { buildSessionLogStorage, TAgentVaultSessionLogStorage } from "./agent-vault-session-log-storage-fns";
import {
  TAgentVaultSessionLogScoped,
  TAgentVaultSessionLogStorageUnavailable,
  TAgentVaultSessionScoped,
  TListSessionLogsDTO,
  TRecordChunkDTO,
  TResolvedSessionLogStorageConfig,
  TTailSessionLogsDTO,
  TUpdateSessionLogSettingsDTO
} from "./agent-vault-session-log-types";

type TAgentVaultSessionLogServiceFactoryDep = {
  agentVaultSessionLogChunkDAL: TAgentVaultSessionLogChunkDALFactory;
  agentVaultSessionLogConfigDAL: TAgentVaultSessionLogConfigDALFactory;
  agentVaultSessionDAL: Pick<TAgentVaultSessionDALFactory, "findOne">;
  agentVaultProxyDAL: Pick<TAgentVaultProxyDALFactory, "findByIdWithOrg" | "find">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithInputKey">;
};

export type TAgentVaultSessionLogServiceFactory = ReturnType<typeof agentVaultSessionLogServiceFactory>;

export const agentVaultSessionLogServiceFactory = ({
  agentVaultSessionLogChunkDAL,
  agentVaultSessionLogConfigDAL,
  agentVaultSessionDAL,
  agentVaultProxyDAL,
  appConnectionDAL,
  appConnectionService,
  permissionService,
  kmsService
}: TAgentVaultSessionLogServiceFactoryDep) => {
  const $storageDeps = { appConnectionDAL, kmsService };

  const storageCache = new Map<string, { storage: TAgentVaultSessionLogStorage; expiresAt: number }>();

  const $getStorage = async (config: TResolvedSessionLogStorageConfig, orgId: string) => {
    // Read on every call so an edited connection is used at once: every edit bumps updatedAt, which is in the key.
    const connection = await appConnectionDAL.findById(config.appConnectionId);
    const key = [
      orgId,
      config.appConnectionId,
      connection?.updatedAt.getTime() ?? "",
      config.bucket,
      config.region,
      config.keyPrefix ?? ""
    ].join("|");
    const cached = storageCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.storage;

    const storage = await buildSessionLogStorage(config, orgId, $storageDeps);
    storageCache.set(key, { storage, expiresAt: Date.now() + AGENT_VAULT_SESSION_LOG_STORAGE_CACHE_MS });

    if (storageCache.size > 512) {
      for (const [entryKey, entry] of storageCache) {
        if (entry.expiresAt <= Date.now()) storageCache.delete(entryKey);
      }
    }

    return storage;
  };

  const toCount = (value: number | string) => Number(value);

  const toChunkView = (row: TAgentVaultSessionLogChunks, proxyName: string, presignedGetUrl: string | null) => ({
    chunkId: row.chunkId,
    proxyId: row.proxyId,
    proxyName,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    firstSeq: toCount(row.firstSeq),
    lastSeq: toCount(row.lastSeq),
    recordCount: row.recordCount,
    droppedCount: toCount(row.droppedCount),
    ciphertextBytes: row.ciphertextBytes,
    iv: row.iv,
    ciphertextSha256: row.ciphertextSha256,
    presignedGetUrl
  });

  const toSettingsView = (config: TAgentVaultSessionLogConfigs) => ({
    enabled: config.enabled,
    appConnectionId: config.appConnectionId ?? null,
    bucket: config.bucket ?? null,
    region: config.region ?? null,
    keyPrefix: config.keyPrefix ?? null
  });

  const $requireAdmin = async ({ projectId, ctx }: TAgentVaultSessionLogScoped) => {
    const { isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    if (!isAdmin) {
      throw new ForbiddenRequestError({
        message: "Only an Agent Vault administrator can view or change session log settings"
      });
    }
  };

  const recordChunk = async ({ proxyId, sessionId, chunk }: TRecordChunkDTO) => {
    const sessionNotFound = () => new NotFoundError({ message: "Session not found" });

    const proxy = await agentVaultProxyDAL.findByIdWithOrg(proxyId);
    if (!proxy) throw sessionNotFound();

    const session = await agentVaultSessionDAL.findOne({ id: sessionId, projectId: proxy.projectId });
    if (!session) throw sessionNotFound();

    const now = new Date();
    // Deleting the owner nulls it through the FK, which fires the update trigger, so updatedAt is when it happened.
    const retirements = [
      session.revokedAt,
      session.expiresAt && session.expiresAt <= now ? session.expiresAt : null,
      isOwnerlessSession(session) ? session.updatedAt : null
    ]
      .filter((at): at is Date => Boolean(at))
      .map((at) => at.getTime());
    const retiredAt = retirements.length ? Math.min(...retirements) : null;

    if (retiredAt !== null && now.getTime() - retiredAt > AGENT_VAULT_SESSION_LOG_LATE_CHUNK_GRACE_MS) {
      throw new UnauthorizedError({ message: "Session ended too long ago to accept session logs" });
    }

    const config = await agentVaultSessionLogConfigDAL.findByProjectIdFromPrimary(proxy.projectId);
    const storage = resolveStorageConfig(config);
    if (!config || !config.enabled || !storage) {
      throw new BadRequestError({
        name: AgentVaultSessionLogErrorName.Disabled,
        message: "Session logs aren't on for this project"
      });
    }

    if (chunk.startedAt > chunk.endedAt) {
      throw new BadRequestError({ message: "Chunk startedAt is after its endedAt" });
    }
    const aheadMs = chunk.endedAt.getTime() - now.getTime();
    if (aheadMs > AGENT_VAULT_SESSION_LOG_CLOCK_SKEW_MS) {
      throw new BadRequestError({
        name: AgentVaultSessionLogErrorName.ClockSkew,
        message: `This proxy's clock is about ${Math.round(aheadMs / 60_000)} minutes ahead of Infisical's. Its clock must be within ${AGENT_VAULT_SESSION_LOG_CLOCK_SKEW_MS / 60_000} minutes for session logs to be recorded`
      });
    }
    if (now.getTime() - chunk.startedAt.getTime() > AGENT_VAULT_SESSION_LOG_MAX_CHUNK_AGE_MS) {
      throw new BadRequestError({ message: "Chunk is older than the maximum accepted age" });
    }
    if (chunk.firstSeq > chunk.lastSeq) {
      throw new BadRequestError({ message: "Chunk firstSeq is greater than its lastSeq" });
    }
    if (chunk.lastSeq - chunk.firstSeq + 1 < chunk.recordCount) {
      throw new BadRequestError({ message: "Chunk holds more records than its sequence range allows" });
    }
    if (chunk.ciphertextBytes < chunk.recordCount * AGENT_VAULT_SESSION_LOG_MIN_BYTES_PER_RECORD) {
      throw new BadRequestError({ message: "Chunk is too small to hold the number of records it claims" });
    }

    let sessionLogStorage: TAgentVaultSessionLogStorage;
    try {
      sessionLogStorage = await $getStorage(storage, proxy.orgId);
    } catch (error) {
      // A 400 would read to the proxy as a malformed chunk to drop; a connection that can't be used is worth a retry.
      if (error instanceof BadRequestError) throw new InternalServerError({ message: error.message });
      throw error;
    }

    const objectKey = buildSessionLogObjectKey({
      keyPrefix: storage.keyPrefix,
      projectId: proxy.projectId,
      sessionId: session.id,
      proxyId,
      startedAt: chunk.startedAt,
      chunkId: chunk.chunkId
    });

    const row = await agentVaultSessionLogChunkDAL.transaction(async (tx) => {
      const created = await agentVaultSessionLogChunkDAL.createIfAbsent(
        {
          ...chunk,
          sessionId: session.id,
          projectId: proxy.projectId,
          proxyId,
          proxyName: proxy.name,
          bucket: storage.bucket,
          objectKey
        },
        tx
      );

      if (!created) {
        const existing = await agentVaultSessionLogChunkDAL.findOne(
          { sessionId: session.id, chunkId: chunk.chunkId },
          tx
        );
        if (!existing) {
          throw new InternalServerError({ message: "Session log chunk vanished between insert and read" });
        }
        if (existing.proxyId !== proxyId) {
          throw new ConflictError({ message: "This chunk ID was already recorded by another proxy" });
        }
        // A proxy only re-sends a chunk it never confirmed uploading, so after a move it belongs at the new destination.
        if (existing.bucket !== storage.bucket || existing.objectKey !== objectKey) {
          return agentVaultSessionLogChunkDAL.updateById(existing.id, { bucket: storage.bucket, objectKey }, tx);
        }
        return existing;
      }

      const stored = await agentVaultSessionLogConfigDAL.recordStoredChunk(config.id, tx);
      if (stored > AGENT_VAULT_SESSION_LOG_MAX_STORED_CHUNKS) {
        throw new BadRequestError({
          name: AgentVaultSessionLogErrorName.CeilingReached,
          message: "Session logs have reached their limit for this organization. Contact Infisical support."
        });
      }
      return created;
    });

    const uploadUrl = await sessionLogStorage.presignPut({
      objectKey: row.objectKey,
      ciphertextBytes: row.ciphertextBytes
    });

    return {
      chunkId: row.chunkId,
      uploadUrl,
      expiresInSeconds: AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS
    };
  };

  const $loadSessionLogs = async ({ projectId, ctx, sessionId }: TAgentVaultSessionScoped) => {
    const { permission, isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionSub.AgentVaultSessions
    );

    const session = await agentVaultSessionDAL.findOne({ id: sessionId, projectId });
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    if (!isSessionOwnedBy(ctx, session) && !isAdmin) {
      throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    }

    const config = await agentVaultSessionLogConfigDAL.findOne({ projectId });
    return { session, config, isAdmin };
  };

  const $openSessionLogs = async ({
    projectId,
    ctx,
    sessionId,
    session,
    config,
    isAdmin,
    rows
  }: TAgentVaultSessionScoped &
    Awaited<ReturnType<typeof $loadSessionLogs>> & { rows: TAgentVaultSessionLogChunks[] }) => {
    const unreadSessionLogs = {
      enabled: isSessionLogIngestEnabled(config),
      sessionKey: null,
      storageUnavailable: null
    };

    if (!config || !rows.length) return { sessionLogs: unreadSessionLogs, chunks: [], isReadable: true };

    if (!session.encryptedSessionLogKey) {
      logger.warn(`agentVaultSessionLog: session has chunks but no session log key [sessionId=${sessionId}]`);
      return { sessionLogs: unreadSessionLogs, chunks: [], isReadable: true };
    }

    // The current name, so a renamed proxy reads the same across its history; a deleted one keeps its stored name.
    const proxyIds = [...new Set(rows.map((row) => row.proxyId))];
    const currentProxyNames = new Map(
      (await agentVaultProxyDAL.find({ projectId, $in: { id: proxyIds } })).map((proxy) => [proxy.id, proxy.name])
    );
    const proxyNameOf = (row: TAgentVaultSessionLogChunks) => currentProxyNames.get(row.proxyId) ?? row.proxyName;

    const unreadable = (storageUnavailable: TAgentVaultSessionLogStorageUnavailable) => ({
      sessionLogs: { ...unreadSessionLogs, storageUnavailable },
      chunks: rows.map((row) => toChunkView(row, proxyNameOf(row), null)),
      isReadable: false
    });

    const storage = resolveStorageConfig(config);
    if (!storage) {
      return unreadable({ reason: AgentVaultSessionLogStorageUnavailableReason.NoConnection, message: null });
    }

    let sessionLogStorage: TAgentVaultSessionLogStorage;
    try {
      sessionLogStorage = await $getStorage(storage, ctx.actorOrgId);
    } catch (error) {
      if (!(error instanceof BadRequestError)) throw error;
      return unreadable({
        reason: AgentVaultSessionLogStorageUnavailableReason.ConnectionUnusable,
        message: isAdmin ? error.message : null
      });
    }

    const sessionKey = await unwrapSessionLogKey(
      { projectId, sessionId, encryptedSessionLogKey: session.encryptedSessionLogKey },
      kmsService
    );

    const chunks = await Promise.all(
      rows.map(async (row) =>
        toChunkView(
          row,
          proxyNameOf(row),
          row.bucket === config.bucket ? await sessionLogStorage.presignGet(row.objectKey) : null
        )
      )
    );

    return {
      sessionLogs: { ...unreadSessionLogs, sessionKey: sessionKey.toString("base64") },
      chunks,
      isReadable: true
    };
  };

  const $caughtUpTo = (readAt: number) => new Date(readAt - AGENT_VAULT_SESSION_LOG_RECEIVE_OVERLAP_MS);

  const listSessionLogs = async ({ limit, before, from, to, ...scope }: TListSessionLogsDTO) => {
    const readAt = Date.now();
    const loaded = await $loadSessionLogs(scope);

    const { chunks: rows, hasMore } = loaded.config
      ? await agentVaultSessionLogChunkDAL.findForSessionPage({
          sessionId: scope.sessionId,
          recordBudget: limit,
          byteBudget: AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES,
          maxChunks: AGENT_VAULT_SESSION_LOG_MAX_PAGE_CHUNKS,
          before,
          from,
          to
        })
      : { chunks: [], hasMore: false };

    const { sessionLogs, chunks } = await $openSessionLogs({ ...scope, ...loaded, rows });

    return {
      sessionLogs,
      chunks,
      nextCursor: hasMore && chunks.length ? encodeHistoryCursor(rows[rows.length - 1].chunkId) : null,
      liveCursor: encodeTailCursor($caughtUpTo(readAt))
    };
  };

  const tailSessionLogs = async ({ limit, receivedAfter, ...scope }: TTailSessionLogsDTO) => {
    const readAt = Date.now();
    const since = receivedAfter ?? $caughtUpTo(readAt);
    const loaded = await $loadSessionLogs(scope);

    const { chunks: rows, hasMore } = loaded.config
      ? await agentVaultSessionLogChunkDAL.findReceivedForSession({
          sessionId: scope.sessionId,
          receivedAfter: since,
          recordBudget: limit,
          byteBudget: AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES,
          maxChunks: AGENT_VAULT_SESSION_LOG_MAX_PAGE_CHUNKS
        })
      : { chunks: [], hasMore: false };

    const { sessionLogs, chunks, isReadable } = await $openSessionLogs({ ...scope, ...loaded, rows });

    // Holding the cursor rather than skipping rows it could not hand links for, so they still arrive once
    // the connection is back.
    if (!isReadable) {
      return { sessionLogs, chunks: [], nextCursor: encodeTailCursor(since), hasMore: false };
    }

    return {
      sessionLogs,
      chunks,
      nextCursor: encodeTailCursor(hasMore ? rows[rows.length - 1].createdAt : $caughtUpTo(readAt)),
      hasMore
    };
  };

  const getSessionLogSettings = async ({ projectId, ctx }: TAgentVaultSessionLogScoped) => {
    await $requireAdmin({ projectId, ctx });

    const config = await agentVaultSessionLogConfigDAL.findOne({ projectId });
    return {
      settings: config
        ? toSettingsView(config)
        : { enabled: false, appConnectionId: null, bucket: null, region: null, keyPrefix: null }
    };
  };

  const getSessionLogHealth = async ({ projectId, ctx }: TAgentVaultSessionLogScoped) => {
    await $requireAdmin({ projectId, ctx });

    const config = await agentVaultSessionLogConfigDAL.findOne({ projectId });
    const storage = resolveStorageConfig(config);

    let connectionError: string | null = null;
    if (storage) {
      try {
        await $getStorage(storage, ctx.actorOrgId);
      } catch (error) {
        logger.warn(error, `agentVaultSessionLog: could not use the session log connection [projectId=${projectId}]`);
        connectionError =
          error instanceof BadRequestError ? error.message : "Couldn't check the AWS connection. Try again.";
      }
    }

    return {
      health: {
        isStorageFull: config ? toCount(config.storedChunkCount) >= AGENT_VAULT_SESSION_LOG_MAX_STORED_CHUNKS : false,
        connectionError
      }
    };
  };

  const getSessionLogCorsProbe = async ({ projectId, ctx }: TAgentVaultSessionLogScoped) => {
    await $requireAdmin({ projectId, ctx });

    const config = await agentVaultSessionLogConfigDAL.findOne({ projectId });
    const storage = resolveStorageConfig(config);
    if (!storage) return { probe: null };

    const sessionLogStorage = await $getStorage(storage, ctx.actorOrgId);
    return {
      probe: {
        url: await sessionLogStorage.mintCorsProbeUrl(),
        expiresInSeconds: AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS
      }
    };
  };

  const updateSessionLogSettings = async ({ projectId, ctx, actor, ...patch }: TUpdateSessionLogSettingsDTO) => {
    await $requireAdmin({ projectId, ctx });

    const existing = await agentVaultSessionLogConfigDAL.findByProjectIdFromPrimary(projectId);
    const current = existing ?? {
      enabled: false,
      appConnectionId: null,
      bucket: null,
      region: null,
      keyPrefix: null
    };

    const next = {
      enabled: patch.enabled ?? current.enabled,
      appConnectionId: patch.appConnectionId === undefined ? (current.appConnectionId ?? null) : patch.appConnectionId,
      bucket: patch.bucket ?? current.bucket ?? null,
      region: patch.region ?? current.region ?? null,
      keyPrefix: patch.keyPrefix === undefined ? (current.keyPrefix ?? null) : patch.keyPrefix || null
    };

    // Any new use of the connection is revalidated, destination changes included, or an admin who may not use
    // it could point it at their own bucket. Never on turn-off: that must work even with a broken connection.
    const usesConnectionAnew =
      next.appConnectionId !== current.appConnectionId ||
      next.bucket !== (current.bucket ?? null) ||
      next.region !== (current.region ?? null) ||
      next.keyPrefix !== (current.keyPrefix ?? null) ||
      (next.enabled && !current.enabled);
    const validatedConnection =
      next.appConnectionId && usesConnectionAnew
        ? await appConnectionService.validateAppConnectionUsageById(
            AppConnection.AWS,
            { connectionId: next.appConnectionId, projectId },
            actor
          )
        : null;

    if (next.enabled) {
      if (!next.appConnectionId && current.enabled && current.appConnectionId) {
        throw new BadRequestError({ message: "Turn off session logs before removing their AWS connection." });
      }
      const missing = (
        [
          ["appConnectionId", "an AWS connection"],
          ["bucket", "a bucket"],
          ["region", "a region"]
        ] as const
      )
        .filter(([field]) => !next[field])
        .map(([, label]) => label);
      if (missing.length) {
        throw new BadRequestError({
          message: `Session logs need ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.`
        });
      }
    }

    const storage = next.enabled ? resolveStorageConfig(next) : null;
    const sessionLogStorage = storage ? await buildSessionLogStorage(storage, ctx.actorOrgId, $storageDeps) : null;
    if (sessionLogStorage) await sessionLogStorage.validate();

    const values = { ...next, projectId };

    let saved: TAgentVaultSessionLogConfigs;
    if (existing) {
      saved = await agentVaultSessionLogConfigDAL.updateById(existing.id, values);
    } else {
      try {
        saved = await agentVaultSessionLogConfigDAL.create(values);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new BadRequestError({ message: "Session log settings were just changed. Reload and try again." });
        }
        throw err;
      }
    }

    storageCache.clear();

    let appConnectionName: string | null = null;
    if (validatedConnection) {
      appConnectionName = validatedConnection.name;
    } else if (saved.appConnectionId) {
      appConnectionName = (await appConnectionDAL.findById(saved.appConnectionId))?.name ?? null;
    }

    return { settings: toSettingsView(saved), appConnectionName };
  };

  return {
    recordChunk,
    listSessionLogs,
    tailSessionLogs,
    getSessionLogSettings,
    getSessionLogHealth,
    getSessionLogCorsProbe,
    updateSessionLogSettings
  };
};
