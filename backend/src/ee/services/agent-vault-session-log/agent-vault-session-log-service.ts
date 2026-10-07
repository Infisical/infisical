import { S3ServiceException } from "@aws-sdk/client-s3";
import { ForbiddenError } from "@casl/ability";

import { TAgentVaultSessionLogConfigs } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import {
  BadRequestError,
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
import { TAgentVaultSessionLogConfigDALFactory } from "./agent-vault-session-log-config-dal";
import {
  AGENT_VAULT_SESSION_LOG_CLOCK_SKEW_MS,
  AGENT_VAULT_SESSION_LOG_FEED_MAX_ENTRIES,
  AGENT_VAULT_SESSION_LOG_FEED_TTL_SECONDS,
  AGENT_VAULT_SESSION_LOG_LATE_CHUNK_GRACE_MS,
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_AGE_MS,
  AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES,
  AGENT_VAULT_SESSION_LOG_MIN_BYTES_PER_RECORD,
  AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS,
  AGENT_VAULT_SESSION_LOG_RANGE_SEAL_MARGIN_MS,
  AGENT_VAULT_SESSION_LOGS_NOT_ON_PLAN
} from "./agent-vault-session-log-constants";
import {
  AgentVaultSessionLogErrorName,
  AgentVaultSessionLogStorageUnavailableReason
} from "./agent-vault-session-log-enums";
import {
  buildSessionLogFolder,
  buildSessionLogObjectKey,
  encodeHistoryCursor,
  encodeTailCursor,
  getSessionLogEntitlement,
  isSessionLogIngestEnabled,
  parseSessionLogObjectKey,
  resolveStorageConfig,
  SESSION_LOG_FEED_START,
  toRev,
  TSessionLogLicenseService
} from "./agent-vault-session-log-fns";
import { unwrapSessionLogKey } from "./agent-vault-session-log-secrets";
import { buildSessionLogStorage, TAgentVaultSessionLogStorage } from "./agent-vault-session-log-storage-fns";
import {
  TAgentVaultSessionLogScoped,
  TAgentVaultSessionLogStorageUnavailable,
  TAgentVaultSessionScoped,
  TListSessionLogsDTO,
  TRecordChunkDTO,
  TTailSessionLogsDTO,
  TUpdateSessionLogSettingsDTO
} from "./agent-vault-session-log-types";

type TAgentVaultSessionLogServiceFactoryDep = {
  agentVaultSessionLogConfigDAL: TAgentVaultSessionLogConfigDALFactory;
  agentVaultSessionDAL: Pick<TAgentVaultSessionDALFactory, "findOne">;
  agentVaultProxyDAL: Pick<TAgentVaultProxyDALFactory, "findByIdWithOrg">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithInputKey">;
  licenseService: TSessionLogLicenseService;
  keyStore: Pick<TKeyStoreFactory, "streamAdd" | "streamRange">;
};

export type TAgentVaultSessionLogServiceFactory = ReturnType<typeof agentVaultSessionLogServiceFactory>;

export const agentVaultSessionLogServiceFactory = ({
  agentVaultSessionLogConfigDAL,
  agentVaultSessionDAL,
  agentVaultProxyDAL,
  appConnectionDAL,
  appConnectionService,
  permissionService,
  kmsService,
  licenseService,
  keyStore
}: TAgentVaultSessionLogServiceFactoryDep) => {
  const $storageDeps = { appConnectionDAL, kmsService };

  const NO_SETTINGS = { enabled: false, appConnectionId: null, bucket: null, region: null, keyPrefix: null };

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
    if (!config?.enabled || !storage) {
      throw new BadRequestError({
        name: AgentVaultSessionLogErrorName.Disabled,
        message: "Session logs are disabled"
      });
    }

    const entitlement = await getSessionLogEntitlement(licenseService, proxy.orgId);
    if (entitlement === "unlicensed") {
      throw new BadRequestError({
        name: AgentVaultSessionLogErrorName.Disabled,
        message: AGENT_VAULT_SESSION_LOGS_NOT_ON_PLAN
      });
    }
    // A 5xx, so the proxy holds the chunk and retries instead of switching session logs off.
    if (entitlement === "unknown") {
      throw new InternalServerError({
        message: "Infisical couldn't confirm this organization's plan right now. The proxy keeps the chunk and retries."
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
    if (chunk.ciphertextBytes < chunk.recordCount * AGENT_VAULT_SESSION_LOG_MIN_BYTES_PER_RECORD) {
      throw new BadRequestError({ message: "Chunk is too small to hold the number of records it claims" });
    }

    let sessionLogStorage: TAgentVaultSessionLogStorage;
    try {
      sessionLogStorage = await buildSessionLogStorage(storage, proxy.orgId, $storageDeps);
    } catch (error) {
      // A 400 would read to the proxy as a malformed chunk to drop; a connection that can't be used is worth a retry.
      // The detail can name the connection and AWS account, and whoever runs the proxy may not be an admin.
      if (error instanceof BadRequestError) {
        logger.warn(error, `agentVaultSessionLog: could not use the session log connection [proxyId=${proxyId}]`);
        throw new InternalServerError({
          message:
            "Session logs can't use their AWS connection right now. An Agent Vault admin can check it in Settings."
        });
      }
      throw error;
    }

    const objectKey = buildSessionLogObjectKey({
      folder: buildSessionLogFolder({
        keyPrefix: storage.keyPrefix,
        projectId: proxy.projectId,
        sessionId: session.id
      }),
      proxyId,
      chunkId: chunk.chunkId
    });
    const uploadUrl = await sessionLogStorage.presignPut({
      objectKey,
      ciphertextBytes: chunk.ciphertextBytes,
      ciphertextSha256: chunk.ciphertextSha256
    });

    // Not awaited: the Redis client queues commands while Redis is down instead of failing, and an upload must
    // never wait on the live view. Started before returning, so the entry is sent ahead of the response.
    void keyStore
      .streamAdd(
        KeyStorePrefixes.AgentVaultSessionLogFeed(session.id),
        "*",
        { key: objectKey, bucket: storage.bucket, bytes: String(chunk.ciphertextBytes) },
        AGENT_VAULT_SESSION_LOG_FEED_MAX_ENTRIES,
        AGENT_VAULT_SESSION_LOG_FEED_TTL_SECONDS,
        true
      )
      .catch((error) =>
        logger.warn(error, `agentVaultSessionLog: could not add a chunk to the live feed [sessionId=${session.id}]`)
      );

    return {
      chunkId: chunk.chunkId,
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
    if (!session || (!isSessionOwnedBy(ctx, session) && !isAdmin)) {
      throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    }

    const config = await agentVaultSessionLogConfigDAL.findOne({ projectId });
    const sessionLogs = {
      enabled:
        isSessionLogIngestEnabled(config) &&
        (await getSessionLogEntitlement(licenseService, ctx.actorOrgId)) !== "unlicensed",
      isRecordable: Boolean(session.encryptedSessionLogKey),
      sessionKey: null as string | null,
      storageUnavailable: null as TAgentVaultSessionLogStorageUnavailable | null
    };
    return { session, config, isAdmin, sessionLogs };
  };

  type TLoadedSessionLogs = Awaited<ReturnType<typeof $loadSessionLogs>>;

  // Never gated on the plan or on session logs being on: what was recorded stays readable.
  const $openStorage = async ({
    ctx,
    config,
    isAdmin
  }: Pick<TLoadedSessionLogs, "config" | "isAdmin"> & { ctx: TAgentVaultSessionScoped["ctx"] }): Promise<
    | { storage: TAgentVaultSessionLogStorage; bucket: string; keyPrefix: string | null }
    | { unavailable: TAgentVaultSessionLogStorageUnavailable }
  > => {
    const storage = resolveStorageConfig(config);
    if (!storage) {
      return { unavailable: { reason: AgentVaultSessionLogStorageUnavailableReason.NoConnection, message: null } };
    }
    try {
      return {
        storage: await buildSessionLogStorage(storage, ctx.actorOrgId, $storageDeps),
        bucket: storage.bucket,
        keyPrefix: storage.keyPrefix
      };
    } catch (error) {
      if (!(error instanceof BadRequestError)) throw error;
      return {
        unavailable: {
          reason: AgentVaultSessionLogStorageUnavailableReason.ConnectionUnusable,
          message: isAdmin ? error.message : null
        }
      };
    }
  };

  const $presignChunks = async (
    keyScope: { projectId: string; sessionId: string; encryptedSessionLogKey: Buffer },
    storage: TAgentVaultSessionLogStorage,
    found: { key: string; chunkId: string; proxyId: string; sealedAt: Date; ciphertextBytes: number }[]
  ) => {
    const chunks = await Promise.all(
      found.map(async ({ key, chunkId, proxyId, sealedAt, ciphertextBytes }) => ({
        chunkId,
        proxyId,
        sealedAt,
        ciphertextBytes,
        presignedGetUrl: await storage.presignGet(key)
      }))
    );
    const sessionKey = await unwrapSessionLogKey(keyScope, kmsService);
    return { chunks, sessionKey: sessionKey.toString("base64") };
  };

  // S3 errors and network failures; anything else is a bug and stays a 500.
  const isStorageError = (error: unknown) =>
    error instanceof S3ServiceException ||
    (error instanceof Error && ("code" in error || error.name === "TimeoutError"));

  const listSessionLogs = async ({ after, from, to, ...scope }: TListSessionLogsDTO) => {
    if (from && to && from > to) {
      throw new BadRequestError({ message: "The 'from' time must be before the 'to' time" });
    }

    const { session, config, isAdmin, sessionLogs } = await $loadSessionLogs(scope);
    if (!config || !session.encryptedSessionLogKey) return { sessionLogs, chunks: [], nextCursor: null };

    // Unreadable storage keeps the cursor, so a retry continues from the same place.
    const unreadable = (storageUnavailable: TAgentVaultSessionLogStorageUnavailable) => ({
      sessionLogs: { ...sessionLogs, storageUnavailable },
      chunks: [],
      nextCursor: after === undefined ? null : encodeHistoryCursor(after)
    });

    const opened = await $openStorage({ ctx: scope.ctx, config, isAdmin });
    if ("unavailable" in opened) return unreadable(opened.unavailable);

    const folder = buildSessionLogFolder({
      keyPrefix: opened.keyPrefix,
      projectId: scope.projectId,
      sessionId: scope.sessionId
    });
    let startAfter: string | undefined;
    if (after !== undefined) startAfter = `${folder}${after}`;
    else if (to) startAfter = `${folder}${toRev(to.getTime() + AGENT_VAULT_SESSION_LOG_RANGE_SEAL_MARGIN_MS)}`;

    let listed: Awaited<ReturnType<TAgentVaultSessionLogStorage["listChunks"]>>;
    try {
      listed = await opened.storage.listChunks({ folder, startAfter });
    } catch (error) {
      if (!isStorageError(error)) throw error;
      logger.warn(error, `agentVaultSessionLog: could not list session logs [sessionId=${scope.sessionId}]`);
      return unreadable({
        reason: AgentVaultSessionLogStorageUnavailableReason.ConnectionUnusable,
        message: isAdmin
          ? `Infisical couldn't list session logs in bucket '${opened.bucket}' (${(error as Error).name}). Check that the connection's credentials allow s3:ListBucket on it`
          : null
      });
    }

    const found: Parameters<typeof $presignChunks>[2] = [];
    let pageBytes = 0;
    let consumed = 0;
    let isBeforeRange = false;
    for (const object of listed.objects) {
      if (found.length && pageBytes + object.size > AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES) break;
      const parsed = parseSessionLogObjectKey(folder, object.key);
      if (parsed && from && parsed.sealedAt < from) {
        isBeforeRange = true;
        break;
      }
      consumed += 1;
      if (parsed) {
        found.push({ ...parsed, key: object.key, ciphertextBytes: object.size });
        pageBytes += object.size;
      }
    }

    const hasMore = !isBeforeRange && consumed > 0 && (consumed < listed.objects.length || listed.isTruncated);
    const nextCursor = hasMore ? encodeHistoryCursor(listed.objects[consumed - 1].key.slice(folder.length)) : null;
    if (!found.length) return { sessionLogs, chunks: [], nextCursor };

    const { chunks, sessionKey } = await $presignChunks(
      {
        projectId: scope.projectId,
        sessionId: scope.sessionId,
        encryptedSessionLogKey: session.encryptedSessionLogKey
      },
      opened.storage,
      found
    );
    return { sessionLogs: { ...sessionLogs, sessionKey }, chunks, nextCursor };
  };

  const tailSessionLogs = async ({ feedEntryId = SESSION_LOG_FEED_START, ...scope }: TTailSessionLogsDTO) => {
    const { session, config, isAdmin, sessionLogs } = await $loadSessionLogs(scope);
    const unchanged = { sessionLogs, chunks: [], nextCursor: encodeTailCursor(feedEntryId) };
    if (!config || !session.encryptedSessionLogKey) return unchanged;

    const entries = await keyStore.streamRange(
      KeyStorePrefixes.AgentVaultSessionLogFeed(scope.sessionId),
      `(${feedEntryId}`,
      "+"
    );
    if (!entries.length) return unchanged;

    // Held rather than advanced, so a short outage loses nothing. After a longer one the feed has moved on, and
    // the chunks show on the next full read.
    const opened = await $openStorage({ ctx: scope.ctx, config, isAdmin });
    if ("unavailable" in opened)
      return { ...unchanged, sessionLogs: { ...sessionLogs, storageUnavailable: opened.unavailable } };

    const folder = buildSessionLogFolder({
      keyPrefix: opened.keyPrefix,
      projectId: scope.projectId,
      sessionId: scope.sessionId
    });
    const found = new Map<string, Parameters<typeof $presignChunks>[2][number]>();
    entries.forEach(([, fieldValues]) => {
      const fields = new Map<string, string>();
      for (let i = 0; i + 1 < fieldValues.length; i += 2) fields.set(fieldValues[i], fieldValues[i + 1]);
      const key = fields.get("key");
      if (!key || fields.get("bucket") !== opened.bucket) return;
      const parsed = parseSessionLogObjectKey(folder, key);
      const ciphertextBytes = Number(fields.get("bytes"));
      if (parsed && Number.isSafeInteger(ciphertextBytes)) found.set(key, { ...parsed, key, ciphertextBytes });
    });

    const nextCursor = encodeTailCursor(entries[entries.length - 1][0]);
    if (!found.size) return { sessionLogs, chunks: [], nextCursor };

    const { chunks, sessionKey } = await $presignChunks(
      {
        projectId: scope.projectId,
        sessionId: scope.sessionId,
        encryptedSessionLogKey: session.encryptedSessionLogKey
      },
      opened.storage,
      [...found.values()]
    );
    return { sessionLogs: { ...sessionLogs, sessionKey }, chunks, nextCursor };
  };

  const getSessionLogSettings = async ({ projectId, ctx }: TAgentVaultSessionLogScoped) => {
    await $requireAdmin({ projectId, ctx });

    const config = await agentVaultSessionLogConfigDAL.findOne({ projectId });
    return {
      settings: config ? toSettingsView(config) : NO_SETTINGS
    };
  };

  const getSessionLogHealth = async ({ projectId, ctx }: TAgentVaultSessionLogScoped) => {
    await $requireAdmin({ projectId, ctx });

    const config = await agentVaultSessionLogConfigDAL.findOne({ projectId });
    const storage = resolveStorageConfig(config);

    let connectionError: string | null = null;
    if (storage) {
      try {
        await buildSessionLogStorage(storage, ctx.actorOrgId, $storageDeps);
      } catch (error) {
        logger.warn(error, `agentVaultSessionLog: could not use the session log connection [projectId=${projectId}]`);
        connectionError =
          error instanceof BadRequestError ? error.message : "Couldn't check the AWS connection. Try again.";
      }
    }

    return {
      health: {
        connectionError
      }
    };
  };

  const getSessionLogCorsProbe = async ({ projectId, ctx }: TAgentVaultSessionLogScoped) => {
    await $requireAdmin({ projectId, ctx });

    const config = await agentVaultSessionLogConfigDAL.findOne({ projectId });
    const storage = resolveStorageConfig(config);
    if (!storage) return { probe: null };

    const sessionLogStorage = await buildSessionLogStorage(storage, ctx.actorOrgId, $storageDeps);
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
    const current = existing ?? NO_SETTINGS;

    const next = {
      enabled: patch.enabled ?? current.enabled,
      appConnectionId: patch.appConnectionId === undefined ? (current.appConnectionId ?? null) : patch.appConnectionId,
      bucket: patch.bucket ?? current.bucket ?? null,
      region: patch.region ?? current.region ?? null,
      keyPrefix: patch.keyPrefix === undefined ? (current.keyPrefix ?? null) : patch.keyPrefix || null
    };

    // Turning off and removing the connection stay open without the plan: the config's foreign key would
    // otherwise block deleting a connection the customer can no longer use.
    const needsLicence =
      (next.enabled && !current.enabled) ||
      next.bucket !== (current.bucket ?? null) ||
      next.region !== (current.region ?? null) ||
      next.keyPrefix !== (current.keyPrefix ?? null) ||
      (next.appConnectionId !== null && next.appConnectionId !== (current.appConnectionId ?? null));
    // Only on a change, so a saved directory bucket can still be turned off.
    if (next.bucket !== (current.bucket ?? null) && next.bucket?.endsWith("--x-s3")) {
      throw new BadRequestError({
        message:
          "Session logs need a general purpose S3 bucket. Directory buckets (names ending in --x-s3) aren't supported."
      });
    }

    const entitlement = needsLicence ? await getSessionLogEntitlement(licenseService, ctx.actorOrgId) : "licensed";
    if (entitlement === "unknown") {
      throw new BadRequestError({
        message: "Infisical couldn't confirm your plan right now. Try again in a few minutes."
      });
    }
    if (entitlement === "unlicensed") {
      throw new BadRequestError({ message: AGENT_VAULT_SESSION_LOGS_NOT_ON_PLAN });
    }

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
