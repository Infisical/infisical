import { ForbiddenError } from "@casl/ability";

import { TAgentVaultActivityConfigs } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
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
import { getAgentVaultProjectAuthority } from "../agent-vault/agent-vault-permission";
import { TAgentVaultProxyDALFactory } from "../agent-vault-proxy/agent-vault-proxy-dal";
import { TAgentVaultSessionDALFactory } from "../agent-vault-session/agent-vault-session-dal";
import { isSessionOwnedBy } from "../agent-vault-session/agent-vault-session-fns";
import { TAgentVaultActivityChunkDALFactory } from "./agent-vault-activity-chunk-dal";
import { TAgentVaultActivityConfigDALFactory } from "./agent-vault-activity-config-dal";
import {
  AGENT_VAULT_ACTIVITY_CLOCK_SKEW_MS,
  AGENT_VAULT_ACTIVITY_LATE_CHUNK_GRACE_MS,
  AGENT_VAULT_ACTIVITY_MAX_CHUNK_AGE_MS,
  AGENT_VAULT_ACTIVITY_MAX_PAGE_CHUNKS,
  AGENT_VAULT_ACTIVITY_MAX_STORED_RECORDS,
  AGENT_VAULT_ACTIVITY_MIN_BYTES_PER_RECORD,
  AGENT_VAULT_ACTIVITY_PRESIGN_EXPIRY_SECONDS,
  AGENT_VAULT_ACTIVITY_STORAGE_CACHE_MS,
  AgentVaultActivityErrorName
} from "./agent-vault-activity-constants";
import { unwrapActivityKey } from "./agent-vault-activity-secrets";
import {
  buildActivityObjectKey,
  buildActivityStorage,
  normalizeKeyPrefix,
  resolveStorageConfig,
  TAgentVaultActivityStorage
} from "./agent-vault-activity-storage";
import {
  TGetActivityConfigDTO,
  TGetSessionActivityDTO,
  TRecordChunkDTO,
  TResolvedActivityStorageConfig,
  TUpdateActivityConfigDTO
} from "./agent-vault-activity-types";

type TAgentVaultActivityServiceFactoryDep = {
  agentVaultActivityChunkDAL: TAgentVaultActivityChunkDALFactory;
  agentVaultActivityConfigDAL: TAgentVaultActivityConfigDALFactory;
  agentVaultSessionDAL: Pick<TAgentVaultSessionDALFactory, "findOne">;
  agentVaultProxyDAL: Pick<TAgentVaultProxyDALFactory, "findByIdWithOrg">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithInputKey">;
};

export type TAgentVaultActivityServiceFactory = ReturnType<typeof agentVaultActivityServiceFactory>;

export const agentVaultActivityServiceFactory = ({
  agentVaultActivityChunkDAL,
  agentVaultActivityConfigDAL,
  agentVaultSessionDAL,
  agentVaultProxyDAL,
  appConnectionDAL,
  appConnectionService,
  permissionService,
  kmsService
}: TAgentVaultActivityServiceFactoryDep) => {
  const $storageDeps = { appConnectionDAL, kmsService };

  /**
   * Building a storage client decrypts the app connection and, for the assume-role method, makes a live
   * STS call. The write path runs once per chunk per session per proxy, so building one per request
   * would put an AssumeRole in front of every flush and be throttled long before the rate limit is.
   *
   * The key carries every field that decides where bytes land or which credentials reach them, so a
   * settings change is picked up on the next request rather than waiting out the TTL. The TTL is what
   * bounds how long rotated credentials on an unchanged connection stay in use.
   */
  const storageCache = new Map<string, { storage: TAgentVaultActivityStorage; expiresAt: number }>();

  const $getStorage = async (config: TResolvedActivityStorageConfig, orgId: string) => {
    const key = [orgId, config.appConnectionId, config.bucket, config.region, config.keyPrefix ?? ""].join("|");
    const cached = storageCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.storage;

    const storage = await buildActivityStorage(config, orgId, $storageDeps);
    storageCache.set(key, { storage, expiresAt: Date.now() + AGENT_VAULT_ACTIVITY_STORAGE_CACHE_MS });

    // Bounded by the number of distinct destinations an instance serves, which is one per project, but
    // cleared wholesale rather than tracked so a long-lived process cannot grow without limit.
    if (storageCache.size > 512) {
      for (const [entryKey, entry] of storageCache) {
        if (entry.expiresAt <= Date.now()) storageCache.delete(entryKey);
      }
    }

    return storage;
  };

  // node-postgres hands back int8 as a string, and no type parser is registered, so every bigint column
  // is coerced before it reaches a response schema that declares a number.
  const toCount = (value: number | string) => Number(value);

  const toConfigView = (config: TAgentVaultActivityConfigs) => ({
    enabled: config.enabled,
    appConnectionId: config.appConnectionId ?? null,
    bucket: config.bucket ?? null,
    region: config.region ?? null,
    keyPrefix: config.keyPrefix ?? null,
    configVersion: config.configVersion
  });

  /** Ingest is on only when the switch is on *and* the row actually points at a bucket. */
  const isIngestEnabled = (config?: TAgentVaultActivityConfigs) =>
    Boolean(config?.enabled && resolveStorageConfig(config));

  const $requireAdmin = async ({ projectId, ctx }: TGetActivityConfigDTO) => {
    const { isAdmin } = await getAgentVaultProjectAuthority({ permissionService }, { projectId, ctx });
    if (!isAdmin) {
      throw new ForbiddenRequestError({
        message: "Only an Agent Vault administrator can view or change activity logging settings"
      });
    }
  };

  /**
   * Written by the proxy on every flush. Not audited: once a minute per session per proxy would swamp the
   * audit table, exactly as resolve would.
   */
  const recordChunk = async ({ proxyId, sessionId, chunk }: TRecordChunkDTO) => {
    // One message for a missing proxy, a missing session and a session in another project, so a proxy
    // cannot use this endpoint to discover which session ids exist elsewhere.
    const sessionNotFound = () => new NotFoundError({ message: "Session not found" });

    const proxy = await agentVaultProxyDAL.findByIdWithOrg(proxyId);
    if (!proxy) throw sessionNotFound();

    const session = await agentVaultSessionDAL.findOne({ id: sessionId, projectId: proxy.projectId });
    if (!session) throw sessionNotFound();

    // The three retirement classes match the sweep's exactly, or a chunk could land for a session the
    // sweep has already decided to delete.
    if (!session.userId && !session.identityId) {
      // Resolve already refuses these, and the actor's deletion time is unknown, so no grace is computable.
      throw new UnauthorizedError({ message: "The identity this session belonged to has been deleted" });
    }

    const now = new Date();
    const expiredAt = session.expiresAt && session.expiresAt <= now ? session.expiresAt.getTime() : null;
    const revokedAt = session.revokedAt ? session.revokedAt.getTime() : null;
    const retiredAt =
      revokedAt !== null && expiredAt !== null ? Math.min(revokedAt, expiredAt) : (revokedAt ?? expiredAt);

    // A chunk recorded during a revoked session's grace window is legitimate, and a day of slack covers a
    // proxy retrying through an outage. Past that the session is on its way to being swept.
    if (retiredAt !== null && now.getTime() - retiredAt > AGENT_VAULT_ACTIVITY_LATE_CHUNK_GRACE_MS) {
      throw new UnauthorizedError({ message: "Session retired too long ago to accept activity" });
    }

    const config = await agentVaultActivityConfigDAL.findOne({ projectId: proxy.projectId });
    const storage = config ? resolveStorageConfig(config) : null;
    if (!config || !config.enabled || !storage) {
      throw new BadRequestError({
        name: AgentVaultActivityErrorName.Disabled,
        message: "Activity logging is not enabled for this project"
      });
    }

    // Semantic checks zod cannot express. The proxy treats these as poison and drops the chunk, so each
    // one has to be a genuine impossibility rather than a transient disagreement.
    if (chunk.startedAt > chunk.endedAt) {
      throw new BadRequestError({ message: "Chunk startedAt is after its endedAt" });
    }
    if (chunk.endedAt.getTime() > now.getTime() + AGENT_VAULT_ACTIVITY_CLOCK_SKEW_MS) {
      throw new BadRequestError({ message: "Chunk endedAt is in the future. Check the proxy's clock" });
    }
    if (now.getTime() - chunk.startedAt.getTime() > AGENT_VAULT_ACTIVITY_MAX_CHUNK_AGE_MS) {
      throw new BadRequestError({ message: "Chunk is older than the maximum accepted age" });
    }
    if (chunk.firstSeq > chunk.lastSeq) {
      throw new BadRequestError({ message: "Chunk firstSeq is greater than its lastSeq" });
    }
    if (chunk.lastSeq - chunk.firstSeq + 1 < chunk.recordCount) {
      throw new BadRequestError({ message: "Chunk holds more records than its sequence range allows" });
    }
    // recordCount is what moves the organization's ceiling, so it cannot be claimed independently of the
    // bytes actually written.
    if (chunk.ciphertextBytes < chunk.recordCount * AGENT_VAULT_ACTIVITY_MIN_BYTES_PER_RECORD) {
      throw new BadRequestError({ message: "Chunk is too small to hold the number of records it claims" });
    }

    const objectKey = buildActivityObjectKey({
      keyPrefix: storage.keyPrefix,
      projectId: proxy.projectId,
      sessionId: session.id,
      proxyId,
      startedAt: chunk.startedAt,
      chunkId: chunk.chunkId
    });

    let row;
    try {
      row = await agentVaultActivityChunkDAL.transaction(async (tx) => {
        const created = await agentVaultActivityChunkDAL.create(
          {
            ...chunk,
            sessionId: session.id,
            projectId: proxy.projectId,
            proxyId,
            proxyName: proxy.name,
            configVersion: config.configVersion,
            objectKey
          },
          tx
        );

        // Takes the config row's lock, so concurrent inserts serialise and each reads its own true total.
        const stored = await agentVaultActivityConfigDAL.recordStoredChunk(
          { id: config.id, recordCount: chunk.recordCount, configVersion: config.configVersion },
          tx
        );
        if (stored > AGENT_VAULT_ACTIVITY_MAX_STORED_RECORDS) {
          // Rolls the insert back with it, so refusing costs nothing and stays refusable next time.
          // The ceiling is ours rather than the customer's, so neither the number nor a way to change
          // it belongs in a message that lands in their proxy's logs.
          throw new BadRequestError({
            name: AgentVaultActivityErrorName.CeilingReached,
            message: "Activity storage for this organization is full and recording is paused. Contact Infisical support"
          });
        }
        return created;
      });
    } catch (error) {
      // Outside the transaction callback: Postgres aborts the transaction on a constraint violation, so
      // the replay read cannot run on tx.
      if (!isUniqueViolation(error)) throw error;

      // A re-POST of a chunk whose PUT failed. Already counted, so it must not increment again.
      row = await agentVaultActivityChunkDAL.findOne({ sessionId: session.id, chunkId: chunk.chunkId });
      if (!row) {
        throw new InternalServerError({ message: "Activity chunk vanished between insert and read" });
      }
    }

    // After commit, deliberately: presigning is a network-shaped operation and must not run under the
    // config row's lock. A failure here is a 500 the proxy retries onto the idempotent path above.
    const activityStorage = await $getStorage(storage, proxy.orgId);
    const uploadUrl = await activityStorage.presignPut({
      objectKey: row.objectKey,
      ciphertextBytes: row.ciphertextBytes
    });

    return {
      chunkId: row.chunkId,
      uploadUrl,
      expiresInSeconds: AGENT_VAULT_ACTIVITY_PRESIGN_EXPIRY_SECONDS
    };
  };

  const getSessionActivity = async ({ projectId, ctx, sessionId, limit, before, from, to }: TGetSessionActivityDTO) => {
    const { permission, isAdmin } = await getAgentVaultProjectAuthority({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionSub.AgentVaultSessions
    );

    const session = await agentVaultSessionDAL.findOne({ id: sessionId, projectId });
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    // The CASL read action alone would let any member read anyone's activity. 404, not 403, per the
    // module's rule that an ungranted id never confirms it exists.
    if (!isSessionOwnedBy(ctx, session) && !isAdmin) {
      throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    }

    const config = await agentVaultActivityConfigDAL.findOne({ projectId });
    const storage = config ? resolveStorageConfig(config) : null;

    const empty = {
      enabled: false,
      sessionKey: null,
      projectId,
      configVersion: config?.configVersion ?? 1,
      chunks: [],
      nextCursor: null
    };

    // No storage at all means nothing was ever written and nothing can be read. `enabled: false` is about
    // ingest; chunks written before the switch was turned off are still served below.
    if (!config || !storage) return empty;

    const { chunks: rows, hasMore } = await agentVaultActivityChunkDAL.findForSessionPage({
      sessionId,
      recordBudget: limit,
      maxChunks: AGENT_VAULT_ACTIVITY_MAX_PAGE_CHUNKS,
      before,
      from,
      to
    });
    if (!rows.length) {
      return { ...empty, enabled: isIngestEnabled(config), configVersion: config.configVersion };
    }

    if (!session.encryptedActivityKey) {
      // Minted before this feature shipped. Chunks cannot exist for it, but be explicit rather than
      // handing the browser rows it has no key for.
      logger.warn(`agentVaultActivity: session has chunks but no activity key [sessionId=${sessionId}]`);
      return { ...empty, enabled: isIngestEnabled(config), configVersion: config.configVersion };
    }

    const activityStorage = await $getStorage(storage, ctx.actorOrgId);
    const sessionKey = await unwrapActivityKey(
      { projectId, encryptedActivityKey: session.encryptedActivityKey },
      kmsService
    );

    const chunks = await Promise.all(
      rows.map(async (row) => ({
        chunkId: row.chunkId,
        proxyId: row.proxyId,
        proxyName: row.proxyName ?? null,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        firstSeq: toCount(row.firstSeq),
        lastSeq: toCount(row.lastSeq),
        recordCount: row.recordCount,
        droppedCount: toCount(row.droppedCount),
        configVersion: row.configVersion,
        ciphertextBytes: row.ciphertextBytes,
        iv: row.iv,
        // A chunk written under an earlier configuration lives in a bucket we are no longer pointed at.
        // Presigning it would hand the browser a URL that 404s, so the UI is told instead.
        presignedGetUrl:
          row.configVersion === config.configVersion ? await activityStorage.presignGet(row.objectKey) : null
      }))
    );

    return {
      enabled: isIngestEnabled(config),
      sessionKey: sessionKey.toString("base64"),
      projectId,
      configVersion: config.configVersion,
      chunks,
      nextCursor: hasMore ? rows[rows.length - 1].chunkId : null
    };
  };

  const getActivityConfig = async ({ projectId, ctx }: TGetActivityConfigDTO) => {
    await $requireAdmin({ projectId, ctx });

    const config = await agentVaultActivityConfigDAL.findOne({ projectId });

    if (!config) {
      return {
        config: {
          enabled: false,
          appConnectionId: null,
          bucket: null,
          region: null,
          keyPrefix: null,
          configVersion: 1
        },
        isStorageFull: false,
        corsProbeUrl: null,
        lastRecordedAt: null
      };
    }

    const storage = resolveStorageConfig(config);
    let corsProbeUrl: string | null = null;
    if (storage) {
      try {
        const activityStorage = await $getStorage(storage, ctx.actorOrgId);
        corsProbeUrl = await activityStorage.mintCorsProbeUrl();
      } catch (error) {
        // A settings page that cannot be opened because the bucket went away is worse than one that opens
        // without its probe. The form still renders and the admin can repoint it.
        logger.warn(error, `agentVaultActivity: could not mint CORS probe url [projectId=${projectId}]`);
      }
    }

    return {
      config: toConfigView(config),
      isStorageFull: toCount(config.storedRecordCount) >= AGENT_VAULT_ACTIVITY_MAX_STORED_RECORDS,
      corsProbeUrl,
      lastRecordedAt: config.lastRecordedAt ?? null
    };
  };

  const updateActivityConfig = async ({ projectId, ctx, actor, ...patch }: TUpdateActivityConfigDTO) => {
    await $requireAdmin({ projectId, ctx });

    const existing = await agentVaultActivityConfigDAL.findOne({ projectId });
    const current = existing ?? {
      enabled: false,
      appConnectionId: null,
      bucket: null,
      region: null,
      keyPrefix: null,
      configVersion: 1
    };

    const next = {
      enabled: patch.enabled ?? current.enabled,
      appConnectionId: patch.appConnectionId === undefined ? (current.appConnectionId ?? null) : patch.appConnectionId,
      bucket: patch.bucket ?? current.bucket ?? null,
      region: patch.region ?? current.region ?? null,
      keyPrefix: patch.keyPrefix === undefined ? (current.keyPrefix ?? null) : normalizeKeyPrefix(patch.keyPrefix)
    };

    // Only when the caller is actually pointing at a different connection. The check resolves the id
    // through the app connection service's own org, type and project-availability checks, which is
    // required for an id the caller supplies but is pure cost for one already stored and unchanged:
    // it was authorized when it was set, and this request has already cleared $requireAdmin. The
    // form posts every field on every save, so without this a save that only flips the toggle pays
    // for it too.
    if (next.appConnectionId && next.appConnectionId !== current.appConnectionId) {
      await appConnectionService.validateAppConnectionUsageById(
        AppConnection.AWS,
        { connectionId: next.appConnectionId, projectId },
        actor
      );
    }

    if (next.enabled) {
      if (!next.appConnectionId && current.enabled && current.appConnectionId) {
        throw new BadRequestError({ message: "Turn recording off before removing its AWS connection." });
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
          message: `Recording needs ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.`
        });
      }
    }

    // Only the bucket and the prefix decide where an object lives. Swapping the connection or correcting
    // the region leaves every existing object exactly where it is, and bumping on those would mark
    // readable history as unreachable.
    // Both prefixes go through normalizeKeyPrefix before they are compared. next.keyPrefix is already
    // normalized, so a stored null (a config created through the API without a prefix) would otherwise
    // read as a move the first time the config dialog saves "", bumping configVersion and marking
    // every existing chunk unreachable when nothing had moved.
    const relocated =
      Boolean(existing) &&
      (next.bucket !== (current.bucket ?? null) ||
        normalizeKeyPrefix(next.keyPrefix) !== normalizeKeyPrefix(current.keyPrefix));

    // Only reached for a destination that is about to be used. Recording off means the bucket is
    // not going to be written to, so checking it buys nothing and can do real harm: a bucket that
    // has since become unreachable, or a connection whose credentials were rotated, would fail the
    // check and leave an admin unable to turn recording off at all.
    const storage = next.enabled ? resolveStorageConfig(next) : null;
    // Deliberately not cached: a save is the one path that has to see the connection as it is right now,
    // and it reuses this one client for both the reachability check and the probe below.
    const activityStorage = storage ? await buildActivityStorage(storage, ctx.actorOrgId, $storageDeps) : null;
    if (activityStorage) await activityStorage.validate();

    const values = {
      ...next,
      projectId,
      configVersion: (existing?.configVersion ?? 1) + (relocated ? 1 : 0),
      // A new destination has recorded nothing yet, whatever the previous one had.
      ...(relocated ? { lastRecordedAt: null } : {})
    };

    const saved = existing
      ? await agentVaultActivityConfigDAL.updateById(existing.id, values)
      : await agentVaultActivityConfigDAL.create(values);

    // A save can repoint the destination, so anything cached for the old one is now the wrong client.
    storageCache.clear();

    const corsProbeUrl = activityStorage ? await activityStorage.mintCorsProbeUrl() : null;

    return {
      config: toConfigView(saved),
      isStorageFull: toCount(saved.storedRecordCount) >= AGENT_VAULT_ACTIVITY_MAX_STORED_RECORDS,
      corsProbeUrl,
      lastRecordedAt: saved.lastRecordedAt ?? null,
      relocated
    };
  };

  return { recordChunk, getSessionActivity, getActivityConfig, updateActivityConfig };
};
