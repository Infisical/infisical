import { buildRedisFromConfig, TRedisConfigKeys } from "@app/lib/config/redis";
import { pgAdvisoryLockHashText } from "@app/lib/crypto/hashtext";
import { applyJitter } from "@app/lib/dates";
import { delay as delayMs } from "@app/lib/delay";
import { ExecutionResult, Redlock, Settings } from "@app/lib/red-lock";

export const PgSqlLock = {
  BootUpMigration: 2023,
  SuperAdminInit: 2024,
  KmsRootKeyInit: 2025,
  OrgGatewayRootCaInit: (orgId: string) => pgAdvisoryLockHashText(`org-gateway-root-ca:${orgId}`),
  OrgGatewayCertExchange: (orgId: string) => pgAdvisoryLockHashText(`org-gateway-cert-exchange:${orgId}`),
  SecretRotationV2Creation: (folderId: string) => pgAdvisoryLockHashText(`secret-rotation-v2-creation:${folderId}`),
  CreateProject: (orgId: string) => pgAdvisoryLockHashText(`create-project:${orgId}`),
  CreateFolder: (envId: string, projectId: string) => pgAdvisoryLockHashText(`create-folder:${envId}-${projectId}`),
  SshInit: (projectId: string) => pgAdvisoryLockHashText(`ssh-bootstrap:${projectId}`)
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
  SecretRotationLock: (rotationId: string) => `secret-rotation-v2-mutex-${rotationId}` as const,
  SecretScanningLock: (dataSourceId: string, resourceExternalId: string) =>
    `secret-scanning-v2-mutex-${dataSourceId}-${resourceExternalId}` as const,
  CaOrderCertificateForSubscriberLock: (subscriberId: string) =>
    `ca-order-certificate-for-subscriber-lock-${subscriberId}` as const,
  SecretSyncLastRunTimestamp: (syncId: string) => `secret-sync-last-run-${syncId}` as const,
  IdentityAccessTokenStatusUpdate: (identityAccessTokenId: string) =>
    `identity-access-token-status:${identityAccessTokenId}`,
  ServiceTokenStatusUpdate: (serviceTokenId: string) => `service-token-status:${serviceTokenId}`,
  GatewayIdentityCredential: (identityId: string) => `gateway-credentials:${identityId}`
};

export const KeyStoreTtls = {
  SetSyncSecretIntegrationLastRunTimestampInSeconds: 60,
  SetSecretSyncLastRunTimestampInSeconds: 60,
  AccessTokenStatusUpdateInSeconds: 120
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
  acquireLock(
    resources: string[],
    duration: number,
    settings?: Partial<Settings>
  ): Promise<{ release: () => Promise<ExecutionResult> }>;
  waitTillReady: ({ key, waitingCb, keyCheckCb, waitIteration, delay, jitter }: TWaitTillReady) => Promise<void>;
  getKeysByPattern: (pattern: string, limit?: number) => Promise<string[]>;
};

export const keyStoreFactory = (redisConfigKeys: TRedisConfigKeys): TKeyStoreFactory => {
  const redis = buildRedisFromConfig(redisConfigKeys);
  const redisLock = new Redlock([redis], { retryCount: 2, retryDelay: 200 });

  const setItem = async (key: string, value: string | number | Buffer, prefix?: string) =>
    redis.set(prefix ? `${prefix}:${key}` : key, value);

  const getItem = async (key: string, prefix?: string) => redis.get(prefix ? `${prefix}:${key}` : key);

  const getItems = async (keys: string[], prefix?: string) =>
    redis.mget(keys.map((key) => (prefix ? `${prefix}:${key}` : key)));

  const setItemWithExpiry = async (
    key: string,
    expiryInSeconds: number | string,
    value: string | number | Buffer,
    prefix?: string
  ) => redis.set(prefix ? `${prefix}:${key}` : key, value, "EX", expiryInSeconds);

  const deleteItem = async (key: string) => redis.del(key);

  const deleteItemsByKeyIn = async (keys: string[]) => {
    if (keys.length === 0) return 0;
    return redis.del(keys);
  };

  const deleteItems = async ({ pattern, batchSize = 500, delay = 1500, jitter = 200 }: TDeleteItems) => {
    let cursor = "0";
    let totalDeleted = 0;

    do {
      // Await in loop is needed so that Redis is not overwhelmed
      // eslint-disable-next-line no-await-in-loop
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 1000); // Count should be 1000 - 5000 for prod loads
      cursor = nextCursor;

      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        const pipeline = redis.pipeline();
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

  const incrementBy = async (key: string, value: number) => redis.incrby(key, value);

  const setExpiry = async (key: string, expiryInSeconds: number) => redis.expire(key, expiryInSeconds);

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

  const getKeysByPattern = async (pattern: string, limit?: number) => {
    let cursor = "0";
    const allKeys: string[] = [];

    do {
      // eslint-disable-next-line no-await-in-loop
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 1000);
      cursor = nextCursor;
      allKeys.push(...keys);

      if (limit && allKeys.length >= limit) {
        return allKeys.slice(0, limit);
      }
    } while (cursor !== "0");

    return allKeys;
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
    getItems
  };
};
