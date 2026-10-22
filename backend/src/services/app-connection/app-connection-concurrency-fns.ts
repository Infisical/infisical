import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";

export const APP_CONNECTION_CONCURRENCY_LIMIT = 3;

export const APP_CONNECTION_AGGREGATE_CONCURRENCY_LIMIT = 15;

export const APP_CONNECTION_CONCURRENCY_TTL_S = 15 * 60;

type TConcurrencyKeyStore = Pick<TKeyStoreFactory, "incrementByAndRefreshExpiryIfUnderLimit" | "decrementByOrDelete">;

export const tryAdmitAppConnectionConcurrency = async (
  keyStore: TConcurrencyKeyStore,
  connectionId: string,
  targetHost?: string
): Promise<boolean> => {
  const aggregateKey = KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId);

  if (!targetHost) {
    const count = await keyStore.incrementByAndRefreshExpiryIfUnderLimit(
      aggregateKey,
      APP_CONNECTION_CONCURRENCY_LIMIT,
      APP_CONNECTION_CONCURRENCY_TTL_S
    );
    return count !== -1;
  }

  const aggregateCount = await keyStore.incrementByAndRefreshExpiryIfUnderLimit(
    aggregateKey,
    APP_CONNECTION_AGGREGATE_CONCURRENCY_LIMIT,
    APP_CONNECTION_CONCURRENCY_TTL_S
  );
  if (aggregateCount === -1) return false;

  const hostCount = await keyStore.incrementByAndRefreshExpiryIfUnderLimit(
    KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId, targetHost),
    APP_CONNECTION_CONCURRENCY_LIMIT,
    APP_CONNECTION_CONCURRENCY_TTL_S
  );
  if (hostCount === -1) {
    await keyStore.decrementByOrDelete(aggregateKey);
    return false;
  }

  return true;
};

export const releaseAppConnectionConcurrency = async (
  keyStore: TConcurrencyKeyStore,
  connectionId: string,
  targetHost?: string
): Promise<void> => {
  await keyStore.decrementByOrDelete(KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId, targetHost));
  if (targetHost) {
    await keyStore.decrementByOrDelete(KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId));
  }
};
