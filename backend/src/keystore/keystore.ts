import { Redis } from "ioredis";

import { Redlock, Settings } from "@app/lib/red-lock";

export type TKeyStoreFactory = ReturnType<typeof keyStoreFactory>;

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

  WaitUntilReadyProjectEnvironmentOperation: (projectId: string) =>
    `wait-until-ready-project-environments-operation-${projectId}`,
  ProjectEnvironmentLock: (projectId: string) => `project-environment-lock-${projectId}` as const,
  SyncSecretIntegrationLock: (projectId: string, environmentSlug: string, secretPath: string) =>
    `sync-integration-mutex-${projectId}-${environmentSlug}-${secretPath}` as const,
  SyncSecretIntegrationLastRunTimestamp: (projectId: string, environmentSlug: string, secretPath: string) =>
    `sync-integration-last-run-${projectId}-${environmentSlug}-${secretPath}` as const,
  SecretSyncLock: (syncId: string) => `secret-sync-mutex-${syncId}` as const,
  SecretSyncLastRunTimestamp: (syncId: string) => `secret-sync-last-run-${syncId}` as const,
  IdentityAccessTokenStatusUpdate: (identityAccessTokenId: string) =>
    `identity-access-token-status:${identityAccessTokenId}`,
  ServiceTokenStatusUpdate: (serviceTokenId: string) => `service-token-status:${serviceTokenId}`
};

export const KeyStoreTtls = {
  SetSyncSecretIntegrationLastRunTimestampInSeconds: 60,
  SetSecretSyncLastRunTimestampInSeconds: 60,
  AccessTokenStatusUpdateInSeconds: 120
};

type TWaitTillReady = {
  key: string;
  waitingCb?: () => void;
  keyCheckCb: (val: string | null) => boolean;
  waitIteration?: number;
  delay?: number;
  jitter?: number;
};

export const keyStoreFactory = (redisUrl: string) => {
  const redis = new Redis(redisUrl);
  const redisLock = new Redlock([redis], { retryCount: 2, retryDelay: 200 });

  const setItem = async (key: string, value: string | number | Buffer, prefix?: string) =>
    redis.set(prefix ? `${prefix}:${key}` : key, value);

  const getItem = async (key: string, prefix?: string) => redis.get(prefix ? `${prefix}:${key}` : key);

  const setItemWithExpiry = async (
    key: string,
    expiryInSeconds: number | string,
    value: string | number | Buffer,
    prefix?: string
  ) => redis.set(prefix ? `${prefix}:${key}` : key, value, "EX", expiryInSeconds);

  const deleteItem = async (key: string) => redis.del(key);

  const incrementBy = async (key: string, value: number) => redis.incrby(key, value);

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
        setTimeout(resolve, Math.max(0, delay + Math.floor((Math.random() * 2 - 1) * jitter)));
      });
      attempts += 1;
      // eslint-disable-next-line
      isReady = keyCheckCb(await getItem(key));
    }
  };

  return {
    setItem,
    getItem,
    setItemWithExpiry,
    deleteItem,
    incrementBy,
    acquireLock(resources: string[], duration: number, settings?: Partial<Settings>) {
      return redisLock.acquire(resources, duration, settings);
    },
    waitTillReady
  };
};
