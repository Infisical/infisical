import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";

import { throwIfAcmeOrderAborted } from "../acme-certificate-authority-errors";

const DNS_RECORD_LOCK_RETRY_DELAY_MS = 2_000;
const DNS_RECORD_LOCK_RETRY_JITTER_MS = 300;

export type TDnsRecordLockKeyStore = Pick<TKeyStoreFactory, "acquireLock">;

type TDnsRecordLock = Awaited<ReturnType<TDnsRecordLockKeyStore["acquireLock"]>>;

// polls one attempt at a time so an aborted order stops waiting instead of taking the lock later
const acquireDnsRecordLock = async (
  keyStore: TDnsRecordLockKeyStore,
  resource: string,
  lockTtlMs: number,
  abortSignal?: AbortSignal
): Promise<TDnsRecordLock | null> => {
  const maxAttempts = Math.ceil(lockTtlMs / DNS_RECORD_LOCK_RETRY_DELAY_MS) + 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAcmeOrderAborted(abortSignal);
    // eslint-disable-next-line no-await-in-loop
    const lock = await keyStore.acquireLock([resource], lockTtlMs, { retryCount: 0 }).catch(() => null);
    if (lock) return lock;
    if (attempt < maxAttempts) {
      // eslint-disable-next-line no-await-in-loop
      await delay(DNS_RECORD_LOCK_RETRY_DELAY_MS + Math.floor(Math.random() * DNS_RECORD_LOCK_RETRY_JITTER_MS));
    }
  }
  return null;
};

export const withDnsRecordLock = async <T>(
  {
    providerName,
    connectionId,
    zoneId,
    name,
    lockTtlMs,
    abortSignal
  }: {
    providerName: string;
    connectionId: string;
    zoneId: string;
    name: string;
    lockTtlMs: number;
    abortSignal?: AbortSignal;
  },
  keyStore: TDnsRecordLockKeyStore,
  operation: () => Promise<T>
): Promise<T> => {
  const lock = await acquireDnsRecordLock(
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
};
