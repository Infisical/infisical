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
import { isDefaultStorageConfigured } from "@app/services/object-storage/object-storage-default-fns";
import { ObjectStorageError } from "@app/services/object-storage/object-storage-errors";
import { isS3DirectoryBucket } from "@app/services/object-storage/object-storage-path-fns";
import { TObjectStorageServiceFactory } from "@app/services/object-storage/object-storage-service";
import { ObjectStorageType } from "@app/services/object-storage/object-storage-types";

import { getAgentVaultPermission } from "../agent-vault/agent-vault-permission";
import { TAgentVaultProxyDALFactory } from "../agent-vault-proxy/agent-vault-proxy-dal";
import { TAgentVaultSessionDALFactory } from "../agent-vault-session/agent-vault-session-dal";
import { isOwnerlessSession, isSessionOwnedBy } from "../agent-vault-session/agent-vault-session-fns";
import { TAgentVaultSessionLogConfigDALFactory } from "./agent-vault-session-log-config-dal";
import {
  AGENT_VAULT_DEFAULT_STORAGE_NOT_ON_PLAN,
  AGENT_VAULT_EXTERNAL_STORAGE_NOT_ON_PLAN,
  AGENT_VAULT_SESSION_LOG_CHUNK_ID_TIME_TOLERANCE_MS,
  AGENT_VAULT_SESSION_LOG_CLOCK_SKEW_MS,
  AGENT_VAULT_SESSION_LOG_FEED_MAX_ENTRIES,
  AGENT_VAULT_SESSION_LOG_FEED_TTL_SECONDS,
  AGENT_VAULT_SESSION_LOG_LATE_CHUNK_GRACE_MS,
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_AGE_MS,
  AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES,
  AGENT_VAULT_SESSION_LOG_MAX_PAGE_CHUNKS,
  AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS,
  AGENT_VAULT_SESSION_LOG_RANGE_MARGIN_MS,
  AGENT_VAULT_SESSION_LOG_STORAGE_NEEDS_ADMIN_MESSAGE,
  AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE_MESSAGE
} from "./agent-vault-session-log-constants";
import {
  AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE,
  AgentVaultSessionLogErrorName
} from "./agent-vault-session-log-enums";
import {
  AgentVaultSessionLogsNamespace,
  buildSessionLogObjectName,
  chunkIdTimeMs,
  describeStorageFailure,
  encodeHistoryCursor,
  encodeTailCursor,
  getEffectiveSessionLogConfig,
  getSessionLogEntitlement,
  getSessionLogRetentionDays,
  parseSessionLogObjectKey,
  SESSION_LOG_FEED_START,
  TEffectiveSessionLogConfig,
  toEffectiveSessionLogConfig,
  toRev,
  toStorageConfig,
  TSessionLogLicenseService,
  TSessionLogStorage
} from "./agent-vault-session-log-fns";
import { unwrapSessionLogKey } from "./agent-vault-session-log-secrets";
import {
  TAgentVaultSessionLogScoped,
  TAgentVaultSessionScoped,
  TCreateChunkUploadUrlDTO,
  TListSessionLogsDTO,
  TTailSessionLogsDTO,
  TUpdateSessionLogSettingsDTO
} from "./agent-vault-session-log-types";

type TAgentVaultSessionLogServiceFactoryDep = {
  agentVaultSessionLogConfigDAL: Pick<
    TAgentVaultSessionLogConfigDALFactory,
    "findOne" | "findByProjectIdFromPrimary" | "upsert"
  >;
  agentVaultSessionDAL: Pick<TAgentVaultSessionDALFactory, "findOne">;
  agentVaultProxyDAL: Pick<TAgentVaultProxyDALFactory, "findByIdWithOrg">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "unwrapKey">;
  licenseService: TSessionLogLicenseService;
  keyStore: Pick<TKeyStoreFactory, "streamAdd" | "streamRange">;
  objectStorage: Pick<TObjectStorageServiceFactory, "at">;
};

export type TAgentVaultSessionLogServiceFactory = ReturnType<typeof agentVaultSessionLogServiceFactory>;

type TSessionLogDisabledReason = "off" | "not-on-plan";

const $openSessionLogLocation = async (
  objectStorage: TAgentVaultSessionLogServiceFactoryDep["objectStorage"],
  storage: TSessionLogStorage,
  orgId: string
) => {
  const location = await objectStorage.at(toStorageConfig(storage)).forOrg(orgId);
  return { bucket: location.bucket, namespace: location.namespace(AgentVaultSessionLogsNamespace) };
};

const $openSessionLogFolder = async (
  objectStorage: TAgentVaultSessionLogServiceFactoryDep["objectStorage"],
  storage: TSessionLogStorage,
  orgId: string,
  sessionId: string
) => {
  const { bucket, namespace } = await $openSessionLogLocation(objectStorage, storage, orgId);
  return { bucket, folder: namespace.folder({ sessionId }) };
};

type TSessionLogFolder = Awaited<ReturnType<typeof $openSessionLogFolder>>["folder"];

const notOnPlanMessage = (storageType: ObjectStorageType) =>
  storageType === ObjectStorageType.Default
    ? AGENT_VAULT_DEFAULT_STORAGE_NOT_ON_PLAN
    : AGENT_VAULT_EXTERNAL_STORAGE_NOT_ON_PLAN;

const isSameStorage = (a: TSessionLogStorage, b?: TSessionLogStorage) => {
  if (!b || a.type !== b.type) return false;
  if (a.type === ObjectStorageType.Default || b.type === ObjectStorageType.Default) return true;
  return (
    a.appConnectionId === b.appConnectionId &&
    a.bucket === b.bucket &&
    a.region === b.region &&
    (a.keyPrefix || null) === (b.keyPrefix || null)
  );
};

const toSettingsView = (config: TEffectiveSessionLogConfig) => ({
  enabled: config.enabled,
  isSaved: config.isSaved,
  storage:
    config.storage.type === ObjectStorageType.Default
      ? { type: ObjectStorageType.Default as const }
      : { ...config.storage, keyPrefix: config.storage.keyPrefix ?? null }
});

const toStorageColumns = (storage: TSessionLogStorage) =>
  storage.type === ObjectStorageType.Default
    ? { storageType: storage.type, appConnectionId: null, bucket: null, region: null, keyPrefix: null }
    : {
        storageType: storage.type,
        appConnectionId: storage.appConnectionId,
        bucket: storage.bucket,
        region: storage.region,
        keyPrefix: storage.keyPrefix || null
      };

export const agentVaultSessionLogServiceFactory = ({
  agentVaultSessionLogConfigDAL,
  agentVaultSessionDAL,
  agentVaultProxyDAL,
  appConnectionDAL,
  appConnectionService,
  permissionService,
  kmsService,
  licenseService,
  keyStore,
  objectStorage
}: TAgentVaultSessionLogServiceFactoryDep) => {
  const $requireAdmin = async ({ projectId, ctx }: TAgentVaultSessionLogScoped) => {
    const { isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    if (!isAdmin) {
      throw new ForbiddenRequestError({
        message: "Only an Agent Vault administrator can view or change session log settings"
      });
    }
  };

  const $settingsState = (saved: TAgentVaultSessionLogConfigs | null) => {
    const hasDefaultStorage = isDefaultStorageConfigured();
    const settings = saved ? toEffectiveSessionLogConfig(saved, hasDefaultStorage) : null;
    return {
      settings: settings ? toSettingsView(settings) : null,
      defaultStorage: { configured: hasDefaultStorage }
    };
  };

  const createChunkUploadUrl = async ({ proxyId, sessionId, chunk }: TCreateChunkUploadUrlDTO) => {
    // Older CLIs send the IV here instead of writing it into the object, so nothing they upload could be opened.
    if (chunk.iv !== undefined) {
      throw new BadRequestError({
        message:
          "This proxy's Infisical CLI is too old to record session logs. Update the Infisical CLI on this machine."
      });
    }

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

    const config = await getEffectiveSessionLogConfig({ agentVaultSessionLogConfigDAL }, proxy.projectId, {
      fromPrimary: true
    });
    if (!config?.enabled) {
      throw new BadRequestError({
        name: AgentVaultSessionLogErrorName.Disabled,
        message: "Session logs are disabled"
      });
    }

    const { entitlement, plan } = await getSessionLogEntitlement(licenseService, proxy.orgId, config.storage.type);
    if (entitlement === "unlicensed") {
      throw new BadRequestError({
        name: AgentVaultSessionLogErrorName.Disabled,
        message: notOnPlanMessage(config.storage.type)
      });
    }
    // A 5xx, so the proxy holds the chunk and retries instead of switching session logs off.
    if (entitlement === "unknown") {
      throw new InternalServerError({
        message: "Infisical couldn't confirm this organization's plan right now. The proxy keeps the chunk and retries."
      });
    }

    const aheadMs = chunk.endedAt.getTime() - now.getTime();
    if (aheadMs > AGENT_VAULT_SESSION_LOG_CLOCK_SKEW_MS) {
      throw new BadRequestError({
        name: AgentVaultSessionLogErrorName.ClockSkew,
        message: `This proxy's clock is about ${Math.round(aheadMs / 60_000)} minutes ahead of Infisical's. Its clock must be within ${AGENT_VAULT_SESSION_LOG_CLOCK_SKEW_MS / 60_000} minutes for session logs to be recorded`
      });
    }
    if (-aheadMs > AGENT_VAULT_SESSION_LOG_MAX_CHUNK_AGE_MS) {
      throw new BadRequestError({
        name: AgentVaultSessionLogErrorName.ClockSkew,
        message: `This proxy's clock is more than ${AGENT_VAULT_SESSION_LOG_MAX_CHUNK_AGE_MS / (24 * 60 * 60_000)} days behind Infisical's. Fix its clock for session logs to be recorded`
      });
    }
    if (
      Math.abs(chunkIdTimeMs(chunk.chunkId) - chunk.endedAt.getTime()) >
      AGENT_VAULT_SESSION_LOG_CHUNK_ID_TIME_TOLERANCE_MS
    ) {
      throw new BadRequestError({ message: "The chunk ID's time must match the chunk's endedAt" });
    }

    let upload: { key: string; url: string };
    let bucket: string;
    try {
      const opened = await $openSessionLogFolder(objectStorage, config.storage, proxy.orgId, session.id);
      bucket = opened.bucket;
      upload = await opened.folder.presignPut({
        name: buildSessionLogObjectName({ proxyId, chunkId: chunk.chunkId }),
        bytes: chunk.ciphertextBytes,
        // The proxy sends it unpadded; S3 wants the padded form
        sha256Base64: `${chunk.ciphertextSha256}=`,
        expiresInSeconds: AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS,
        retentionDays: getSessionLogRetentionDays(plan)
      });
    } catch (error) {
      // A 400 would read to the proxy as a malformed chunk to drop; storage that can't be used is worth a retry. The
      // detail can name the connection and AWS account, and whoever runs the proxy may not be an admin. The daily
      // cap's 429 passes through, and the proxy retries it the next minute.
      if (!(error instanceof ObjectStorageError)) throw error;
      logger.warn(error, `agentVaultSessionLog: could not use session log storage [proxyId=${proxyId}]`);
      throw new InternalServerError({
        message:
          config.storage.type === ObjectStorageType.Default
            ? "Session logs can't reach default storage right now. The proxy keeps the chunk and retries."
            : "Session logs can't use their AWS connection right now. An Agent Vault admin can check it in Settings."
      });
    }

    // Not awaited: the Redis client queues commands while Redis is down instead of failing, and an upload must
    // never wait on the live view. Started before returning, so the entry is sent ahead of the response.
    void keyStore
      .streamAdd(
        KeyStorePrefixes.AgentVaultSessionLogFeed(session.id),
        "*",
        { key: upload.key, bucket, bytes: String(chunk.ciphertextBytes) },
        AGENT_VAULT_SESSION_LOG_FEED_MAX_ENTRIES,
        AGENT_VAULT_SESSION_LOG_FEED_TTL_SECONDS,
        true
      )
      .catch((error) =>
        logger.warn(error, `agentVaultSessionLog: could not add a chunk to the live feed [sessionId=${session.id}]`)
      );

    return {
      chunkId: chunk.chunkId,
      uploadUrl: upload.url,
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

    const config = await getEffectiveSessionLogConfig({ agentVaultSessionLogConfigDAL }, projectId, {
      fromPrimary: false
    });

    // Turning session logs off hides what was recorded, until they're turned back on. Reads also need the plan for
    // the storage in use: a deliberate exception to CODE_QUALITY.md "License Checks", chosen for Agent Vault session
    // logs. An unknown plan (License Server down, no recent answer) still allows reading.
    let disabledReason: TSessionLogDisabledReason | null = null;
    if (!config?.enabled) disabledReason = "off";
    else if (
      (await getSessionLogEntitlement(licenseService, ctx.actorOrgId, config.storage.type)).entitlement === "unlicensed"
    ) {
      disabledReason = "not-on-plan";
    }

    const sessionLogs = {
      enabled: disabledReason === null,
      disabledReason,
      isRecordable: Boolean(session.encryptedSessionLogKey),
      sessionKey: null as string | null
    };
    return { session, config: disabledReason ? null : config, isAdmin, sessionLogs };
  };

  // A 500 when trying again later can help, a 400 when the settings or the storage need fixing.
  const $storageUnavailable = ({
    isAdmin,
    adminMessage,
    isTemporary = false
  }: {
    isAdmin: boolean;
    adminMessage: string;
    isTemporary?: boolean;
  }) => {
    let message = adminMessage;
    if (!isAdmin) {
      message = isTemporary
        ? AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE_MESSAGE
        : AGENT_VAULT_SESSION_LOG_STORAGE_NEEDS_ADMIN_MESSAGE;
    }
    const error = { name: AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE, message };
    return isTemporary ? new InternalServerError(error) : new BadRequestError(error);
  };

  const $toStorageUnavailable = (error: unknown, isAdmin: boolean, sessionId: string) => {
    if (!(error instanceof ObjectStorageError)) return error;
    logger.warn(error, `agentVaultSessionLog: could not read session logs [sessionId=${sessionId}]`);
    const failure = describeStorageFailure(error, "read");
    return $storageUnavailable({ isAdmin, adminMessage: failure.message, isTemporary: failure.isTemporary });
  };

  const $presignChunks = async (
    keyScope: { projectId: string; sessionId: string; encryptedSessionLogKey: Buffer },
    folder: TSessionLogFolder,
    found: { key: string; chunkId: string; proxyId: string; ciphertextBytes: number }[]
  ) => {
    const chunks = await Promise.all(
      found.map(async ({ key, chunkId, proxyId, ciphertextBytes }) => ({
        chunkId,
        proxyId,
        ciphertextBytes,
        presignedGetUrl: await folder.presignGet(key, AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS)
      }))
    );
    const sessionKey = await unwrapSessionLogKey(keyScope, kmsService);
    return { chunks, sessionKey: sessionKey.toString("base64") };
  };

  const listSessionLogs = async ({ cursor, from, to, ...scope }: TListSessionLogsDTO) => {
    if (from && to && from > to) {
      throw new BadRequestError({ message: "The 'from' time must be before the 'to' time" });
    }

    const { session, config, isAdmin, sessionLogs } = await $loadSessionLogs(scope);
    if (!config || !session.encryptedSessionLogKey) return { sessionLogs, chunks: [], nextCursor: null };

    try {
      // The stored id, not the route's: Postgres matches a uuid in any case, but S3 keys and the key's scope don't.
      const { folder } = await $openSessionLogFolder(objectStorage, config.storage, scope.ctx.actorOrgId, session.id);

      let startAfter: string | undefined;
      if (cursor !== undefined) startAfter = `${folder.prefix}${cursor}`;
      else if (to) startAfter = `${folder.prefix}${toRev(to.getTime() + AGENT_VAULT_SESSION_LOG_RANGE_MARGIN_MS)}`;

      const listed = await folder.list({ startAfter, maxKeys: AGENT_VAULT_SESSION_LOG_MAX_PAGE_CHUNKS });

      const found: Parameters<typeof $presignChunks>[2] = [];
      let pageBytes = 0;
      let consumed = 0;
      let isBeforeRange = false;
      for (const object of listed.objects) {
        if (found.length && pageBytes + object.size > AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES) break;
        const parsed = parseSessionLogObjectKey(folder.prefix, object.key);
        if (parsed && from && parsed.lastRecordAt < from) {
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
      const nextCursor = hasMore
        ? encodeHistoryCursor(listed.objects[consumed - 1].key.slice(folder.prefix.length))
        : null;
      if (!found.length) return { sessionLogs, chunks: [], nextCursor };

      const { chunks, sessionKey } = await $presignChunks(
        {
          projectId: scope.projectId,
          sessionId: session.id,
          encryptedSessionLogKey: session.encryptedSessionLogKey
        },
        folder,
        found
      );
      return { sessionLogs: { ...sessionLogs, sessionKey }, chunks, nextCursor };
    } catch (error) {
      throw $toStorageUnavailable(error, isAdmin, session.id);
    }
  };

  const tailSessionLogs = async ({ cursor = SESSION_LOG_FEED_START, ...scope }: TTailSessionLogsDTO) => {
    const { session, config, isAdmin, sessionLogs } = await $loadSessionLogs(scope);
    const unchanged = { sessionLogs, chunks: [], nextCursor: encodeTailCursor(cursor) };
    if (!config || !session.encryptedSessionLogKey) return unchanged;

    const entries = await keyStore.streamRange(
      KeyStorePrefixes.AgentVaultSessionLogFeed(session.id),
      `(${cursor}`,
      "+"
    );
    if (!entries.length) return unchanged;

    // Fails rather than advancing, so the caller's cursor stays put and a short outage loses nothing. After a longer
    // one the feed has moved on, and the chunks show on the next full read.
    try {
      const { bucket, folder } = await $openSessionLogFolder(
        objectStorage,
        config.storage,
        scope.ctx.actorOrgId,
        session.id
      );

      // Every entry, repeats included: the browser reads a full feed from the count, and dedupes by chunk itself.
      // Entries from another bucket or folder are from before a storage change, and reads only show current storage.
      const found: Parameters<typeof $presignChunks>[2] = [];
      entries.forEach(([, fieldValues]) => {
        const fields = new Map<string, string>();
        for (let i = 0; i + 1 < fieldValues.length; i += 2) fields.set(fieldValues[i], fieldValues[i + 1]);
        const key = fields.get("key");
        if (!key || fields.get("bucket") !== bucket) return;
        const parsed = parseSessionLogObjectKey(folder.prefix, key);
        const ciphertextBytes = Number(fields.get("bytes"));
        if (parsed && Number.isSafeInteger(ciphertextBytes)) found.push({ ...parsed, key, ciphertextBytes });
      });

      const nextCursor = encodeTailCursor(entries[entries.length - 1][0]);
      if (!found.length) return { sessionLogs, chunks: [], nextCursor };

      const { chunks, sessionKey } = await $presignChunks(
        {
          projectId: scope.projectId,
          sessionId: session.id,
          encryptedSessionLogKey: session.encryptedSessionLogKey
        },
        folder,
        found
      );
      return { sessionLogs: { ...sessionLogs, sessionKey }, chunks, nextCursor };
    } catch (error) {
      throw $toStorageUnavailable(error, isAdmin, session.id);
    }
  };

  const getSessionLogSettings = async ({ projectId, ctx }: TAgentVaultSessionLogScoped) => {
    await $requireAdmin({ projectId, ctx });

    const config = await getEffectiveSessionLogConfig({ agentVaultSessionLogConfigDAL }, projectId, {
      fromPrimary: false
    });
    return {
      settings: config ? toSettingsView(config) : null,
      defaultStorage: { configured: isDefaultStorageConfigured() }
    };
  };

  // While off, or while the plan doesn't include the storage, nothing is recorded or shown, so a storage problem isn't
  // something an admin can act on. An unknown plan still counts. The instance's bucket is the operator's: its problems
  // are logged at boot, never shown to an org admin.
  const $isExternalStorageInUse = async (config: TEffectiveSessionLogConfig, orgId: string) =>
    config.storage.type === ObjectStorageType.External &&
    config.enabled &&
    (await getSessionLogEntitlement(licenseService, orgId, config.storage.type)).entitlement !== "unlicensed";

  const getSessionLogHealth = async ({ projectId, ctx }: TAgentVaultSessionLogScoped) => {
    await $requireAdmin({ projectId, ctx });

    const config = await getEffectiveSessionLogConfig({ agentVaultSessionLogConfigDAL }, projectId, {
      fromPrimary: false
    });

    let connectionError: string | null = null;
    if (config && (await $isExternalStorageInUse(config, ctx.actorOrgId))) {
      try {
        const { namespace } = await $openSessionLogLocation(objectStorage, config.storage, ctx.actorOrgId);
        await namespace.listAccess();
      } catch (error) {
        logger.warn(error, `agentVaultSessionLog: session log storage check failed [projectId=${projectId}]`);
        connectionError =
          error instanceof ObjectStorageError
            ? describeStorageFailure(error, "check").message
            : "Couldn't check the AWS connection. Try again.";
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

    const config = await getEffectiveSessionLogConfig({ agentVaultSessionLogConfigDAL }, projectId, {
      fromPrimary: false
    });
    if (!config || !(await $isExternalStorageInUse(config, ctx.actorOrgId))) return { probe: null };

    try {
      const { namespace } = await $openSessionLogLocation(objectStorage, config.storage, ctx.actorOrgId);
      return {
        probe: {
          url: await namespace.presignCorsProbe(AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS),
          expiresInSeconds: AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS
        }
      };
    } catch (error) {
      if (!(error instanceof ObjectStorageError)) throw error;
      const failure = describeStorageFailure(error, "check");
      throw failure.isTemporary
        ? new InternalServerError({ message: failure.message })
        : new BadRequestError({ message: failure.message });
    }
  };

  const updateSessionLogSettings = async ({
    projectId,
    ctx,
    actor,
    enabled: requestedEnabled,
    storage: requestedStorage
  }: TUpdateSessionLogSettingsDTO) => {
    await $requireAdmin({ projectId, ctx });

    const current = await getEffectiveSessionLogConfig({ agentVaultSessionLogConfigDAL }, projectId, {
      fromPrimary: true
    });

    let requested: TSessionLogStorage | undefined;
    if (requestedStorage?.type === ObjectStorageType.External) {
      requested = { ...requestedStorage, keyPrefix: requestedStorage.keyPrefix || null };
    } else if (requestedStorage) {
      requested = { type: ObjectStorageType.Default };
    }

    if (requestedEnabled === false && requested) {
      throw new BadRequestError({ message: "Leave out storage when turning session logs off" });
    }
    if (requested?.type === ObjectStorageType.Default && !isDefaultStorageConfigured()) {
      throw new BadRequestError({ message: "This instance doesn't offer default storage" });
    }

    // Choosing a storage turns session logs on.
    const nextEnabled = requestedEnabled ?? (requested ? true : (current?.enabled ?? true));

    // Turning off forgets the storage, which frees an AWS connection to be deleted. The row stays, saying off: with
    // nothing saved, session logs are on in default storage. Turning off is never gated by the plan.
    if (!nextEnabled) {
      const [saved] = await agentVaultSessionLogConfigDAL.upsert(
        [{ projectId, enabled: false, ...toStorageColumns({ type: ObjectStorageType.Default }) }],
        "projectId"
      );
      const cleared =
        current?.storage.type === ObjectStorageType.External
          ? { appConnectionId: current.storage.appConnectionId, bucket: current.storage.bucket }
          : null;
      return { ...$settingsState(saved), appConnectionName: null, cleared };
    }

    const isStorageChange = requested !== undefined && !isSameStorage(requested, current?.storage);
    const nextStorage = requested ?? current?.storage ?? null;
    if (!nextStorage) throw new BadRequestError({ message: "Choose where to store session logs" });

    // Choosing, changing or turning on a storage needs that storage on the plan.
    const isTurningOn = !(current?.isSaved && current.enabled);
    if (isStorageChange || isTurningOn) {
      const { entitlement } = await getSessionLogEntitlement(licenseService, ctx.actorOrgId, nextStorage.type);
      if (entitlement === "unknown") {
        throw new BadRequestError({
          message: "Infisical couldn't confirm your plan right now. Try again in a few minutes."
        });
      }
      if (entitlement === "unlicensed") throw new BadRequestError({ message: notOnPlanMessage(nextStorage.type) });
    }

    let validatedConnection: { name: string } | null = null;
    if (nextStorage.type === ObjectStorageType.External) {
      const previous = current?.storage.type === ObjectStorageType.External ? current.storage : null;
      // Only on a change, so a saved directory bucket can still be turned off.
      if (nextStorage.bucket !== previous?.bucket && isS3DirectoryBucket(nextStorage.bucket)) {
        throw new BadRequestError({
          message:
            "Session logs need a general purpose S3 bucket. Directory buckets (names ending in --x-s3) aren't supported."
        });
      }

      // Any new use of the connection is revalidated, destination changes included, or an admin who may not use it
      // could point it at their own bucket.
      const usesConnectionAnew = isStorageChange || !current?.enabled;
      if (usesConnectionAnew) {
        validatedConnection = await appConnectionService.validateAppConnectionUsageById(
          AppConnection.AWS,
          { connectionId: nextStorage.appConnectionId, projectId },
          actor
        );
      }

      if (usesConnectionAnew) {
        try {
          const { namespace } = await $openSessionLogLocation(objectStorage, nextStorage, ctx.actorOrgId);
          await namespace.check();
        } catch (error) {
          if (!(error instanceof ObjectStorageError)) throw error;
          logger.warn(error, `agentVaultSessionLog: session log bucket check failed [projectId=${projectId}]`);
          const failure = describeStorageFailure(error, "check");
          throw failure.isTemporary
            ? new InternalServerError({ message: failure.message })
            : new BadRequestError({ message: failure.message });
        }
      }
    }

    // An upsert, not a create or update chosen from the effective settings: a saved default row on an instance that
    // lost its bucket has no effective settings but still holds the project's unique row.
    const [saved] = await agentVaultSessionLogConfigDAL.upsert(
      [{ projectId, enabled: true, ...toStorageColumns(nextStorage) }],
      "projectId"
    );

    let appConnectionName: string | null = null;
    if (validatedConnection) {
      appConnectionName = validatedConnection.name;
    } else if (saved.appConnectionId) {
      appConnectionName = (await appConnectionDAL.findById(saved.appConnectionId))?.name ?? null;
    }

    return { ...$settingsState(saved), appConnectionName, cleared: null };
  };

  return {
    createChunkUploadUrl,
    listSessionLogs,
    tailSessionLogs,
    getSessionLogSettings,
    getSessionLogHealth,
    getSessionLogCorsProbe,
    updateSessionLogSettings
  };
};
