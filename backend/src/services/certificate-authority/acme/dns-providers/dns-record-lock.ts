import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

const RECORD_LOCK_RETRY_DELAY_MS = 2_000;
const RECORD_LOCK_MIN_RETRY_COUNT = 50;

// a waiter must outlast the holder's lock TTL, or it gives up while the holder is still within bounds
const getLockRetrySettings = (lockTtlMs: number) => ({
  retryCount: Math.max(RECORD_LOCK_MIN_RETRY_COUNT, Math.ceil(lockTtlMs / RECORD_LOCK_RETRY_DELAY_MS)),
  retryDelay: RECORD_LOCK_RETRY_DELAY_MS,
  retryJitter: 300
});

export type TDnsRecordLockKeyStore = Pick<TKeyStoreFactory, "acquireLock">;

const pendingRecordOperations = new Map<string, Promise<void>>();

const withLocalRecordLock = async <T>(key: string, operation: () => Promise<T>): Promise<T> => {
  const pending = pendingRecordOperations.get(key) ?? Promise.resolve();
  const result = pending.then(operation, operation);
  const settled = result.then(
    () => undefined,
    () => undefined
  );

  pendingRecordOperations.set(key, settled);
  void settled.then(() => {
    if (pendingRecordOperations.get(key) === settled) pendingRecordOperations.delete(key);
  });

  return result;
};

export const withDnsRecordLock = async <T>(
  {
    connectionId,
    zoneId,
    name,
    providerName,
    lockTtlMs
  }: { connectionId: string; zoneId: string; name: string; providerName: string; lockTtlMs: number },
  keyStore: TDnsRecordLockKeyStore | undefined,
  operation: () => Promise<T>
): Promise<T> =>
  withLocalRecordLock(`${connectionId}|${zoneId}|${name}`, async () => {
    if (!keyStore) return operation();

    const lock = await keyStore
      .acquireLock(
        [KeyStorePrefixes.AcmeDnsRecordLock(connectionId, zoneId, name)],
        lockTtlMs,
        getLockRetrySettings(lockTtlMs)
      )
      .catch(() => null);

    if (!lock) {
      throw new Error(
        `Timed out waiting to update the ${providerName} record '${name}'. Another certificate order is still using it.`
      );
    }

    try {
      return await operation();
    } finally {
      await lock.release().catch((error) => {
        logger.warn(error, `Failed to release ${providerName} record lock [zoneId=${zoneId}] [name=${name}]`);
      });
    }
  });
