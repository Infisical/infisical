import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";

import { throwIfAcmeOrderAborted } from "../acme-certificate-authority-errors";

const RECORD_LOCK_RETRY_DELAY_MS = 2_000;
const RECORD_LOCK_RETRY_JITTER_MS = 300;
const RECORD_LOCK_MIN_ATTEMPTS = 50;

export type TDnsRecordLockKeyStore = Pick<TKeyStoreFactory, "acquireLock">;

type TRecordLock = Awaited<ReturnType<TDnsRecordLockKeyStore["acquireLock"]>>;

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

// polls one attempt at a time so an aborted order stops waiting instead of taking the lock later
const acquireRecordLock = async (
  keyStore: TDnsRecordLockKeyStore,
  resource: string,
  lockTtlMs: number,
  abortSignal?: AbortSignal
): Promise<TRecordLock | null> => {
  const maxAttempts = Math.max(RECORD_LOCK_MIN_ATTEMPTS, Math.ceil(lockTtlMs / RECORD_LOCK_RETRY_DELAY_MS) + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAcmeOrderAborted(abortSignal);
    // eslint-disable-next-line no-await-in-loop
    const lock = await keyStore.acquireLock([resource], lockTtlMs, { retryCount: 0 }).catch(() => null);
    if (lock) return lock;
    if (attempt < maxAttempts) {
      // eslint-disable-next-line no-await-in-loop
      await delay(RECORD_LOCK_RETRY_DELAY_MS + Math.floor(Math.random() * RECORD_LOCK_RETRY_JITTER_MS));
    }
  }
  return null;
};

export const withDnsRecordLock = async <T>(
  {
    connectionId,
    zoneId,
    name,
    providerName,
    lockTtlMs,
    abortSignal
  }: {
    connectionId: string;
    zoneId: string;
    name: string;
    providerName: string;
    lockTtlMs: number;
    abortSignal?: AbortSignal;
  },
  keyStore: TDnsRecordLockKeyStore | undefined,
  operation: () => Promise<T>
): Promise<T> =>
  withLocalRecordLock(`${connectionId}|${zoneId}|${name}`, async () => {
    throwIfAcmeOrderAborted(abortSignal);
    if (!keyStore) return operation();

    const lock = await acquireRecordLock(
      keyStore,
      KeyStorePrefixes.AcmeDnsRecordLock(connectionId, zoneId, name),
      lockTtlMs,
      abortSignal
    );

    if (!lock) {
      throw new Error(
        `Timed out waiting to update the ${providerName} record '${name}'. Another certificate order is still using it.`
      );
    }

    try {
      throwIfAcmeOrderAborted(abortSignal);
      return await operation();
    } finally {
      await lock.release().catch((error) => {
        logger.warn(error, `Failed to release ${providerName} record lock [zoneId=${zoneId}] [name=${name}]`);
      });
    }
  });
