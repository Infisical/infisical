import { Cluster, Redis } from "ioredis";
import { Knex } from "knex";

import { buildRedisFromConfig, TRedisConfigKeys } from "@app/lib/config/redis";
import { pgAdvisoryLockHashText } from "@app/lib/crypto/hashtext";
import { applyJitter } from "@app/lib/dates";
import { delay as delayMs } from "@app/lib/delay";
import { ms } from "@app/lib/ms";
import { ExecutionResult, Redlock, Settings } from "@app/lib/red-lock";

import { TKeyValueStoreDALFactory } from "./key-value-store-dal";

export const PgSqlLock = {
  BootUpMigration: 2023,
  SuperAdminInit: 2024,
  KmsRootKeyInit: 2025,
  SanitizedSchemaGeneration: 2026,
  OrgGatewayRootCaInit: (orgId: string) => pgAdvisoryLockHashText(`org-gateway-root-ca:${orgId}`),
  OrgGatewayCertExchange: (orgId: string) => pgAdvisoryLockHashText(`org-gateway-cert-exchange:${orgId}`),
  SecretRotationV2Creation: (folderId: string) => pgAdvisoryLockHashText(`secret-rotation-v2-creation:${folderId}`),
  CreateProject: (orgId: string) => pgAdvisoryLockHashText(`create-project:${orgId}`),
  CreateFolder: (envId: string, projectId: string) => pgAdvisoryLockHashText(`create-folder:${envId}-${projectId}`),
  SshInit: (projectId: string) => pgAdvisoryLockHashText(`ssh-bootstrap:${projectId}`),
  InstanceRelayConfigInit: () => pgAdvisoryLockHashText("instance-relay-config-init"),
  OrgGatewayV2Init: (orgId: string) => pgAdvisoryLockHashText(`org-gateway-v2-init:${orgId}`),
  OrgRelayConfigInit: (orgId: string) => pgAdvisoryLockHashText(`org-relay-config-init:${orgId}`),
  GatewayPamSessionKey: (gatewayId: string) => pgAdvisoryLockHashText(`gateway-pam-session-key:${gatewayId}`),
  IdentityLogin: (identityId: string, nonce: string) => pgAdvisoryLockHashText(`identity-login:${identityId}:${nonce}`),
  PamResourceSshCaInit: (resourceId: string) => pgAdvisoryLockHashText(`pam-resource-ssh-ca-init:${resourceId}`),
  CreateIdentity: (orgId: string) => pgAdvisoryLockHashText(`create-identity:${orgId}`)
} as const;

// all the key prefixes used must be set here to avoid conflict
export const KeyStorePrefixes = {
  SecretReplication: "secret-replication-import-lock",
  KmsProjectDataKeyCreation: "kms-project-data-key-creation-lock",
  KmsProjectKeyCreation: "kms-project-key-creation-lock",
  WaitUntilReadyKmsProjectDataKeyCreation: "wait-until-ready-kms-project-data-key-creation-",
  WaitUntilReadyKmsProjectKeyCreation: "wait-until-ready-kms-project-key-creation-",
  KmsOrgKeyCreation: "kms-org-key-creation-lock",
  KmsOrgDataKeyCreation: "kms-org-data-key-creation-lock",
  WaitUntilReadyKmsOrgKeyCreation: "wait-until-ready-kms-org-key-creation-",
  WaitUntilReadyKmsOrgDataKeyCreation: "wait-until-ready-kms-org-data-key-creation-",
  FolderTreeCheckpoint: (envId: string) => `folder-tree-checkpoint-${envId}`,

  WaitUntilReadyProjectEnvironmentOperation: (projectId: string) =>
    `wait-until-ready-project-environments-operation-${projectId}`,
  ProjectEnvironmentLock: (projectId: string) => `project-environment-lock-${projectId}` as const,
  SyncSecretIntegrationLock: (projectId: string, environmentSlug: string, secretPath: string) =>
    `sync-integration-mutex-${projectId}-${environmentSlug}-${secretPath}` as const,
  SyncSecretIntegrationLastRunTimestamp: (projectId: string, environmentSlug: string, secretPath: string) =>
    `sync-integration-last-run-${projectId}-${environmentSlug}-${secretPath}` as const,
  SecretSyncLock: (syncId: string) => `secret-sync-mutex-${syncId}` as const,
  PkiSyncLock: (syncId: string) => `pki-sync-mutex-${syncId}` as const,
  AppConnectionConcurrentJobs: (connectionId: string) => `app-connection-concurrency-${connectionId}` as const,
  SecretRotationLock: (rotationId: string) => `secret-rotation-v2-mutex-${rotationId}` as const,
  SecretScanningLock: (dataSourceId: string, resourceExternalId: string) =>
    `secret-scanning-v2-mutex-${dataSourceId}-${resourceExternalId}` as const,
  IdentityLockoutLock: (lockoutKey: string) => `identity-lockout-lock-${lockoutKey}` as const,
  CaOrderCertificateForSubscriberLock: (subscriberId: string) =>
    `ca-order-certificate-for-subscriber-lock-${subscriberId}` as const,
  SecretSyncLastRunTimestamp: (syncId: string) => `secret-sync-last-run-${syncId}` as const,
  IdentityAccessTokenStatusUpdate: (identityAccessTokenId: string) =>
    `identity-access-token-status:${identityAccessTokenId}`,
  ServiceTokenStatusUpdate: (serviceTokenId: string) => `service-token-status:${serviceTokenId}`,
  GatewayIdentityCredential: (identityId: string) => `gateway-credentials:${identityId}`,
  ActiveSSEConnectionsSet: (projectId: string, identityId: string) =>
    `sse-connections:${projectId}:${identityId}` as const,
  ActiveSSEConnections: (projectId: string, identityId: string, connectionId: string) =>
    `sse-connections:${projectId}:${identityId}:${connectionId}` as const,

  ProjectPermission: (
    projectId: string,
    version: number,
    actorType: string,
    actorId: string,
    actionProjectType: string
  ) => `project-permission:${projectId}:${version}:${actorType}:${actorId}:${actionProjectType}` as const,
  ProjectPermissionDalVersion: (projectId: string) => `project-permission:${projectId}:dal-version` as const,
  UserProjectPermissionPattern: (userId: string) => `project-permission:*:*:USER:${userId}:*` as const,
  IdentityProjectPermissionPattern: (identityId: string) => `project-permission:*:*:IDENTITY:${identityId}:*` as const,
  GroupMemberProjectPermissionPattern: (projectId: string, groupId: string) =>
    `group-member-project-permission:${projectId}:${groupId}:*` as const,

  PkiAcmeNonce: (nonce: string) => `pki-acme-nonce:${nonce}` as const,
  MfaSession: (mfaSessionId: string) => `mfa-session:${mfaSessionId}` as const,
  WebAuthnChallenge: (userId: string) => `webauthn-challenge:${userId}` as const,
  UserMfaLockoutLock: (userId: string) => `user-mfa-lockout-lock:${userId}` as const,
  UserMfaUnlockEmailSent: (userId: string) => `user-mfa-unlock-email-sent:${userId}` as const,

  AiMcpServerOAuth: (sessionId: string) => `ai-mcp-server-oauth:${sessionId}` as const,

  // AI MCP Endpoint OAuth
  AiMcpEndpointOAuthClient: (clientId: string) => `ai-mcp-endpoint-oauth-client:${clientId}` as const,
  AiMcpEndpointOAuthCode: (clientId: string, code: string) => `ai-mcp-endpoint-oauth-code:${clientId}:${code}` as const,

  // Project SSE Connection Rate Limiting
  ProjectSSEConnectionsSet: (projectId: string) => `project-sse-connections:${projectId}` as const,
  ProjectSSEConnectionsLockoutKey: (projectId: string) => `project-sse-connections:lockout:${projectId}` as const,
  ProjectSSEConnection: (projectId: string, connectionId: string) =>
    `project-sse-conn:${projectId}:${connectionId}` as const
};

export const KeyStoreTtls = {
  SetSyncSecretIntegrationLastRunTimestampInSeconds: 60,
  SetSecretSyncLastRunTimestampInSeconds: 60,
  AccessTokenStatusUpdateInSeconds: 120,
  ProjectPermissionCacheInSeconds: 300, // 5 minutes
  ProjectPermissionDalVersionTtl: "15m", // Project permission DAL version TTL
  MfaSessionInSeconds: 300, // 5 minutes
  WebAuthnChallengeInSeconds: 300, // 5 minutes
  ProjectSSEConnectionTtlSeconds: 180 // Must be > heartbeat interval (60s) * 2
};

type TDeleteItems = {
  pattern: string;
  batchSize?: number;
  delay?: number;
  jitter?: number;
};

type TWaitTillReady = {
  key: string;
  waitingCb?: () => void;
  keyCheckCb: (val: string | null) => boolean;
  waitIteration?: number;
  delay?: number;
  jitter?: number;
};

export type TKeyStoreFactory = {
  setItem: (key: string, value: string | number | Buffer, prefix?: string) => Promise<"OK">;
  getItem: (key: string, prefix?: string) => Promise<string | null>;
  getItems: (keys: string[], prefix?: string) => Promise<(string | null)[]>;
  setExpiry: (key: string, expiryInSeconds: number) => Promise<number>;
  setItemWithExpiry: (
    key: string,
    expiryInSeconds: number | string,
    value: string | number | Buffer,
    prefix?: string
  ) => Promise<"OK">;
  deleteItem: (key: string) => Promise<number>;
  deleteItemsByKeyIn: (keys: string[]) => Promise<number>;
  deleteItems: (arg: TDeleteItems) => Promise<number>;
  incrementBy: (key: string, value: number) => Promise<number>;
  getKeysByPattern: (pattern: string, limit?: number) => Promise<string[]>;
  // list operations
  listPush: (key: string, value: string) => Promise<number>;
  listRange: (key: string, start: number, stop: number) => Promise<string[]>;
  listRemove: (key: string, count: number, value: string) => Promise<number>;
  listLength: (key: string) => Promise<number>;
  // pg
  pgIncrementBy: (key: string, dto: { incr?: number; expiry?: string; tx?: Knex }) => Promise<number>;
  pgGetIntItem: (key: string, prefix?: string) => Promise<number | undefined>;
  // locks
  acquireLock(
    resources: string[],
    duration: number,
    settings?: Partial<Settings>
  ): Promise<{ release: () => Promise<ExecutionResult> }>;
  waitTillReady: ({ key, waitingCb, keyCheckCb, waitIteration, delay, jitter }: TWaitTillReady) => Promise<void>;
};

const pickPrimaryOrSecondaryRedis = (primary: Redis | Cluster, secondaries?: Array<Redis | Cluster>) => {
  if (!secondaries || !secondaries.length) return primary;
  const selectedReplica = secondaries[Math.floor(Math.random() * secondaries.length)];
  return selectedReplica;
};

interface TKeyStoreFactoryDTO extends TRedisConfigKeys {
  REDIS_READ_REPLICAS?: { host: string; port: number }[];
}

export const keyStoreFactory = (
  redisConfigKeys: TKeyStoreFactoryDTO,
  keyValueStoreDAL: TKeyValueStoreDALFactory
): TKeyStoreFactory => {
  const primaryRedis = buildRedisFromConfig(redisConfigKeys);
  const redisReadReplicas = redisConfigKeys.REDIS_READ_REPLICAS?.map((el) => {
    if (redisConfigKeys.REDIS_URL) {
      const primaryNode = new URL(redisConfigKeys?.REDIS_URL);
      primaryNode.hostname = el.host;
      primaryNode.port = String(el.port);
      return buildRedisFromConfig({ ...redisConfigKeys, REDIS_URL: primaryNode.toString() });
    }

    if (redisConfigKeys.REDIS_SENTINEL_HOSTS) {
      return buildRedisFromConfig({ ...redisConfigKeys, REDIS_SENTINEL_HOSTS: [el] });
    }

    return buildRedisFromConfig({ ...redisConfigKeys, REDIS_CLUSTER_HOSTS: [el] });
  });
  const redisLock = new Redlock([primaryRedis], { retryCount: 2, retryDelay: 200 });

  const setItem = async (key: string, value: string | number | Buffer, prefix?: string) =>
    primaryRedis.set(prefix ? `${prefix}:${key}` : key, value);

  const getItem = async (key: string, prefix?: string) =>
    pickPrimaryOrSecondaryRedis(primaryRedis, redisReadReplicas).get(prefix ? `${prefix}:${key}` : key);

  const getItems = async (keys: string[], prefix?: string) =>
    pickPrimaryOrSecondaryRedis(primaryRedis, redisReadReplicas).mget(
      keys.map((key) => (prefix ? `${prefix}:${key}` : key))
    );

  const setItemWithExpiry = async (
    key: string,
    expiryInSeconds: number | string,
    value: string | number | Buffer,
    prefix?: string
  ) => primaryRedis.set(prefix ? `${prefix}:${key}` : key, value, "EX", expiryInSeconds);

  const deleteItem = async (key: string) => primaryRedis.del(key);

  const deleteItemsByKeyIn = async (keys: string[]) => {
    if (keys.length === 0) return 0;
    return primaryRedis.del(keys);
  };

  const deleteItems = async ({ pattern, batchSize = 500, delay = 1500, jitter = 200 }: TDeleteItems) => {
    let cursor = "0";
    let totalDeleted = 0;

    do {
      // Await in loop is needed so that Redis is not overwhelmed
      // eslint-disable-next-line no-await-in-loop
      const [nextCursor, keys] = await primaryRedis.scan(cursor, "MATCH", pattern, "COUNT", 1000); // Count should be 1000 - 5000 for prod loads
      cursor = nextCursor;

      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        const pipeline = primaryRedis.pipeline();
        for (const key of batch) {
          pipeline.unlink(key);
        }
        // eslint-disable-next-line no-await-in-loop
        await pipeline.exec();
        totalDeleted += batch.length;

        // eslint-disable-next-line no-await-in-loop
        await delayMs(Math.max(0, applyJitter(delay, jitter)));
      }
    } while (cursor !== "0");

    return totalDeleted;
  };

  const incrementBy = async (key: string, value: number) => primaryRedis.incrby(key, value);

  const setExpiry = async (key: string, expiryInSeconds: number) => primaryRedis.expire(key, expiryInSeconds);

  const getKeysByPattern = async (pattern: string, limit?: number) => {
    let cursor = "0";
    const allKeys: string[] = [];

    do {
      // eslint-disable-next-line no-await-in-loop
      const [nextCursor, keys] = await pickPrimaryOrSecondaryRedis(primaryRedis, redisReadReplicas).scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        1000
      );
      cursor = nextCursor;
      allKeys.push(...keys);

      if (limit && allKeys.length >= limit) {
        return allKeys.slice(0, limit);
      }
    } while (cursor !== "0");

    return allKeys;
  };

  const pgIncrementBy: TKeyStoreFactory["pgIncrementBy"] = async (key, { incr = 1, tx, expiry }) => {
    const expiresAt = expiry ? new Date(Date.now() + ms(expiry)) : undefined;
    return keyValueStoreDAL.incrementBy(key, { incr, expiresAt, tx });
  };

  const pgGetIntItem = async (key: string, prefix?: string) =>
    keyValueStoreDAL.findOneInt(prefix ? `${prefix}:${key}` : key);

  // List operations
  const listPush = async (key: string, value: string) => primaryRedis.rpush(key, value);

  const listRange = async (key: string, start: number, stop: number) =>
    pickPrimaryOrSecondaryRedis(primaryRedis, redisReadReplicas).lrange(key, start, stop);

  const listRemove = async (key: string, count: number, value: string) => primaryRedis.lrem(key, count, value);

  const listLength = async (key: string) => pickPrimaryOrSecondaryRedis(primaryRedis, redisReadReplicas).llen(key);

  const waitTillReady = async ({
    key,
    waitingCb,
    keyCheckCb,
    waitIteration = 10,
    delay = 1000,
    jitter = 200
  }: TWaitTillReady) => {
    let attempts = 0;
    let isReady = keyCheckCb(await getItem(key));
    while (!isReady) {
      if (attempts > waitIteration) return;
      // eslint-disable-next-line
      await new Promise((resolve) => {
        waitingCb?.();
        setTimeout(resolve, Math.max(0, applyJitter(delay, jitter)));
      });
      attempts += 1;
      // eslint-disable-next-line
      isReady = keyCheckCb(await getItem(key));
    }
  };

  return {
    setItem,
    getItem,
    setExpiry,
    setItemWithExpiry,
    deleteItem,
    deleteItems,
    incrementBy,
    acquireLock(resources: string[], duration: number, settings?: Partial<Settings>) {
      return redisLock.acquire(resources, duration, settings);
    },
    waitTillReady,
    getKeysByPattern,
    deleteItemsByKeyIn,
    getItems,
    pgGetIntItem,
    pgIncrementBy,
    listPush,
    listRange,
    listRemove,
    listLength
  };
};
