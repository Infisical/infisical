import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { logger } from "@app/lib/logger";

import {
  describeEndpoint,
  describeUnverifiableChannelBinding,
  getInstanceTlsEndpoint,
  hasServerChannelBindingLearningFailed,
  learnServerChannelBindings,
  readServerChannelBindings,
  TInstanceTlsEndpoint,
  TServerChannelBindingEntry
} from "./microsoft-autoenrollment-channel-binding-fns";

const CHANNEL_BINDING_REFRESH_AFTER_MS = 60 * 60 * 1000;

export type TExpectedChannelBindings = { endpoint: TInstanceTlsEndpoint; entries: TServerChannelBindingEntry[] };

export type TChannelBindingCache = ReturnType<typeof channelBindingCacheFactory>;

export const channelBindingCacheFactory = ({
  keyStore
}: {
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX" | "getItem" | "setItemWithExpiry" | "deleteItem">;
}) => {
  const learningServerChannelBindings = new Map<string, Promise<TServerChannelBindingEntry[]>>();

  const $recordLearningFailure = async (endpoint: TInstanceTlsEndpoint, learnError: unknown) => {
    const endpointKey = describeEndpoint(endpoint);
    logger.warn(
      { err: learnError, host: endpoint.host, port: endpoint.port },
      "Unable to read the TLS certificates the instance host serves, so Microsoft Autoenrollment cannot learn its channel bindings"
    );
    await keyStore
      .setItemWithExpiry(
        KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsLearnFailed(endpointKey),
        KeyStoreTtls.MicrosoftAutoenrollmentServerChannelBindingsLearnFailedInSeconds,
        1
      )
      .catch(() => undefined);
    await keyStore
      .setItemWithExpiry(
        KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsLastFailure(endpointKey),
        KeyStoreTtls.MicrosoftAutoenrollmentServerChannelBindingsLastFailureInSeconds,
        describeUnverifiableChannelBinding(endpoint)
      )
      .catch(() => undefined);
  };

  const $storeLearnedBindings = async (
    endpoint: TInstanceTlsEndpoint,
    learnedBindings: string[],
    cachedEntries: TServerChannelBindingEntry[]
  ) => {
    const endpointKey = describeEndpoint(endpoint);
    const seenAt = new Date().toISOString();
    const entries = [
      ...learnedBindings.map((binding) => ({ binding, seenAt })),
      ...cachedEntries.filter(({ binding }) => !learnedBindings.includes(binding))
    ];
    await keyStore
      .setItemWithExpiry(
        KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindings(endpointKey),
        KeyStoreTtls.MicrosoftAutoenrollmentServerChannelBindingsInSeconds,
        JSON.stringify(entries)
      )
      .catch((err: unknown) => {
        logger.warn({ err }, "Unable to cache the TLS channel bindings for Microsoft Autoenrollment");
      });
    await keyStore
      .deleteItem(KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsLastFailure(endpointKey))
      .catch(() => undefined);
    return entries;
  };

  const $learn = (endpoint: TInstanceTlsEndpoint, cachedEntries: TServerChannelBindingEntry[] = []) => {
    const endpointKey = describeEndpoint(endpoint);
    const inFlight = learningServerChannelBindings.get(endpointKey);
    if (inFlight) return inFlight;

    const learning = (async () => {
      let learnError: unknown;
      const learnedBindings = await learnServerChannelBindings(endpoint).catch((err: unknown): string[] => {
        learnError = err;
        return [];
      });
      if (!learnedBindings.length) {
        await $recordLearningFailure(endpoint, learnError);
        return cachedEntries;
      }
      return $storeLearnedBindings(endpoint, learnedBindings, cachedEntries);
    })().finally(() => learningServerChannelBindings.delete(endpointKey));

    learningServerChannelBindings.set(endpointKey, learning);
    return learning;
  };

  const refresh = async (endpoint: TInstanceTlsEndpoint, cachedEntries: TServerChannelBindingEntry[]) => {
    const isRefreshAllowed =
      (await keyStore
        .setItemWithExpiryNX(
          KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsRefreshLock(describeEndpoint(endpoint)),
          KeyStoreTtls.MicrosoftAutoenrollmentServerChannelBindingsRefreshLockInSeconds,
          1
        )
        .catch(() => null)) === "OK";
    if (isRefreshAllowed) return $learn(endpoint, cachedEntries);
    const localLearning = learningServerChannelBindings.get(describeEndpoint(endpoint));
    if (localLearning) return localLearning;
    const sharedEntries = await readServerChannelBindings(keyStore, endpoint);
    return sharedEntries.length ? sharedEntries : null;
  };

  const loadExpected = async (): Promise<TExpectedChannelBindings | null> => {
    if (crypto.isFipsModeEnabled()) return null;
    const endpoint = getInstanceTlsEndpoint();
    if (!endpoint) return null;

    const entries = await readServerChannelBindings(keyStore, endpoint);
    if (entries.length) {
      const lastSeenAt = Math.max(...entries.map(({ seenAt }) => new Date(seenAt).getTime()));
      if (Date.now() - lastSeenAt > CHANNEL_BINDING_REFRESH_AFTER_MS) {
        void refresh(endpoint, entries).catch(() => undefined);
      }
      return { endpoint, entries };
    }

    if (await hasServerChannelBindingLearningFailed(keyStore, endpoint)) return null;

    const learnedEntries = await $learn(endpoint);
    return learnedEntries.length ? { endpoint, entries: learnedEntries } : null;
  };

  return { loadExpected, refresh };
};
