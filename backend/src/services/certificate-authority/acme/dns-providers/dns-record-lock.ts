import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

const DNS_RECORD_LOCK_RETRY_DELAY_MS = 2_000;
const DNS_RECORD_LOCK_RETRY_JITTER_MS = 300;

export const withDnsRecordLock = async <T>(
  {
    providerName,
    connectionId,
    zoneId,
    name,
    lockTtlMs
  }: { providerName: string; connectionId: string; zoneId: string; name: string; lockTtlMs: number },
  keyStore: Pick<TKeyStoreFactory, "acquireLock">,
  operation: () => Promise<T>
): Promise<T> => {
  const lock = await keyStore
    .acquireLock([KeyStorePrefixes.AcmeDnsRecordLock(connectionId, zoneId, name)], lockTtlMs, {
      retryCount: Math.ceil(lockTtlMs / DNS_RECORD_LOCK_RETRY_DELAY_MS) + 5,
      retryDelay: DNS_RECORD_LOCK_RETRY_DELAY_MS,
      retryJitter: DNS_RECORD_LOCK_RETRY_JITTER_MS
    })
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
};
