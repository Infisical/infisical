import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";

import {
  PKI_SYNC_CONNECTION_AGGREGATE_CONCURRENCY_LIMIT,
  PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT,
  PKI_SYNC_CONNECTION_CONCURRENCY_TTL_S
} from "./pki-sync-enums";

type TConcurrencyKeyStore = Pick<TKeyStoreFactory, "incrementByAndRefreshExpiryIfUnderLimit" | "decrementByOrDelete">;

export const tryAdmitPkiSyncConcurrency = async (
  keyStore: TConcurrencyKeyStore,
  connectionId: string,
  targetHost?: string
): Promise<boolean> => {
  const aggregateKey = KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId);

  if (!targetHost) {
    const count = await keyStore.incrementByAndRefreshExpiryIfUnderLimit(
      aggregateKey,
      PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT,
      PKI_SYNC_CONNECTION_CONCURRENCY_TTL_S
    );
    return count !== -1;
  }

  const aggregateCount = await keyStore.incrementByAndRefreshExpiryIfUnderLimit(
    aggregateKey,
    PKI_SYNC_CONNECTION_AGGREGATE_CONCURRENCY_LIMIT,
    PKI_SYNC_CONNECTION_CONCURRENCY_TTL_S
  );
  if (aggregateCount === -1) return false;

  const hostCount = await keyStore.incrementByAndRefreshExpiryIfUnderLimit(
    KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId, targetHost),
    PKI_SYNC_CONNECTION_CONCURRENCY_LIMIT,
    PKI_SYNC_CONNECTION_CONCURRENCY_TTL_S
  );
  if (hostCount === -1) {
    await keyStore.decrementByOrDelete(aggregateKey);
    return false;
  }

  return true;
};

export const releasePkiSyncConcurrency = async (
  keyStore: TConcurrencyKeyStore,
  connectionId: string,
  targetHost?: string
): Promise<void> => {
  await keyStore.decrementByOrDelete(KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId, targetHost));
  if (targetHost) {
    await keyStore.decrementByOrDelete(KeyStorePrefixes.AppConnectionConcurrentJobs(connectionId));
  }
};
