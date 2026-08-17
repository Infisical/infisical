import crypto from "node:crypto";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";

import { logger } from "../logger";

// A reservation bridges the gap between choosing a gateway and its channel actually opening, so two
// concurrent selections cannot both read a stale zero and stampede the same member. It only has to
// span a relay dial plus two TLS handshakes, and it is released explicitly: left to expire on its
// own the counter would behave like "selections in the last N seconds", which is request-count
// round-robin rather than the occupancy signal this is supposed to be.
const RESERVATION_TTL_SECONDS = 20;
const RESERVATION_HOLD_MS = 5_000;
const SUSPECT_TTL_SECONDS = 60;
const LOAD_HASH_TTL_SECONDS = 600;

// Another pod's published count is ignored past this age, so a pod that dies stops skewing selection
// instead of leaving its channels counted forever.
const PUBLISHED_COUNT_MAX_AGE_MS = 90_000;
const PUBLISH_DEBOUNCE_MS = 250;
const PUBLISH_REFRESH_MS = 20_000;

const podId = crypto.randomUUID();

type TGatewayLoadTracker = {
  reserve: (gatewayId: string) => Promise<void>;
  channelOpened: (gatewayId: string) => void;
  channelClosed: (gatewayId: string) => void;
  markSuspect: (gatewayId: string) => Promise<void>;
  getScores: (gatewayIds: string[]) => Promise<Map<string, number>>;
  getSuspect: (gatewayIds: string[]) => Promise<Set<string>>;
  shutdown: () => void;
};

let tracker: TGatewayLoadTracker | undefined;

const loadKey = KeyStorePrefixes.GatewayLoad;
const reservationKey = KeyStorePrefixes.GatewayLoadReservation;
const suspectKey = KeyStorePrefixes.GatewaySuspect;

export const initGatewayLoadTracker = (keyStore: TKeyStoreFactory): TGatewayLoadTracker => {
  const openChannels = new Map<string, number>();
  const pendingPublish = new Set<string>();
  const reservationTimers = new Set<NodeJS.Timeout>();
  let debounceTimer: NodeJS.Timeout | undefined;

  const publish = async (gatewayId: string) => {
    const count = openChannels.get(gatewayId) ?? 0;
    try {
      // Holding nothing means dropping the field rather than writing a zero, so the hash only ever
      // carries pods with live channels instead of accumulating one entry per restart.
      if (count === 0) {
        await keyStore.hashDelete(loadKey(gatewayId), podId);
        return;
      }
      await keyStore.hashSet(loadKey(gatewayId), podId, `${count}:${Date.now()}`);
      await keyStore.setExpiry(loadKey(gatewayId), LOAD_HASH_TTL_SECONDS);
    } catch (err) {
      logger.debug({ err, gatewayId }, `Failed to publish gateway load [gatewayId=${gatewayId}]`);
    }
  };

  const flushPending = () => {
    const ids = [...pendingPublish];
    pendingPublish.clear();
    debounceTimer = undefined;
    void Promise.all(ids.map((id) => publish(id)));
  };

  const schedulePublish = (gatewayId: string) => {
    pendingPublish.add(gatewayId);
    if (!debounceTimer) {
      debounceTimer = setTimeout(flushPending, PUBLISH_DEBOUNCE_MS);
      debounceTimer.unref();
    }
  };

  // Long-lived channels change the count once and then sit for hours, so the timestamp has to be
  // refreshed independently or other pods would age the entry out while it is still accurate.
  const refreshTimer = setInterval(() => {
    for (const gatewayId of openChannels.keys()) {
      schedulePublish(gatewayId);
    }
  }, PUBLISH_REFRESH_MS);
  refreshTimer.unref();

  const channelOpened = (gatewayId: string) => {
    openChannels.set(gatewayId, (openChannels.get(gatewayId) ?? 0) + 1);
    schedulePublish(gatewayId);
  };

  const channelClosed = (gatewayId: string) => {
    const next = (openChannels.get(gatewayId) ?? 0) - 1;
    if (next > 0) {
      openChannels.set(gatewayId, next);
    } else {
      openChannels.delete(gatewayId);
    }
    schedulePublish(gatewayId);
  };

  const releaseReservation = async (gatewayId: string) => {
    try {
      await keyStore.decrementByOrDelete(reservationKey(gatewayId));
    } catch (err) {
      logger.debug({ err, gatewayId }, `Failed to release gateway reservation [gatewayId=${gatewayId}]`);
    }
  };

  const reserve = async (gatewayId: string) => {
    try {
      await keyStore.incrementByWithExpiry(reservationKey(gatewayId), 1, RESERVATION_TTL_SECONDS);
    } catch (err) {
      logger.debug({ err, gatewayId }, `Failed to reserve gateway capacity [gatewayId=${gatewayId}]`);
      return;
    }
    // The key TTL is only a backstop for a pod that dies holding reservations.
    const timer = setTimeout(() => {
      reservationTimers.delete(timer);
      void releaseReservation(gatewayId);
    }, RESERVATION_HOLD_MS);
    timer.unref();
    reservationTimers.add(timer);
  };

  const markSuspect = async (gatewayId: string) => {
    try {
      await keyStore.setItemWithExpiry(suspectKey(gatewayId), SUSPECT_TTL_SECONDS, "1");
    } catch (err) {
      logger.debug({ err, gatewayId }, `Failed to mark gateway suspect [gatewayId=${gatewayId}]`);
      return;
    }
    logger.warn(
      { gatewayId },
      `Gateway marked suspect after transport failure [gatewayId=${gatewayId}] [ttlSeconds=${SUSPECT_TTL_SECONDS}]`
    );
  };

  const getScores = async (gatewayIds: string[]) => {
    const scores = new Map<string, number>();
    if (gatewayIds.length === 0) return scores;

    const [published, reservations] = await Promise.all([
      Promise.all(gatewayIds.map((id) => keyStore.hashGetAll(loadKey(id)))),
      keyStore.getItemsPrimary(gatewayIds.map((id) => reservationKey(id)))
    ]);

    const cutoff = Date.now() - PUBLISHED_COUNT_MAX_AGE_MS;

    gatewayIds.forEach((gatewayId, idx) => {
      const fields = Object.entries(published[idx] ?? {})
        // This pod's in-memory count is always fresher than what it last published.
        .filter(([fieldPodId]) => fieldPodId !== podId);

      let total = 0;
      for (const [, raw] of fields) {
        const [countStr, tsStr] = raw.split(":");
        const count = Number(countStr);
        const publishedAt = Number(tsStr);
        if (Number.isFinite(count) && Number.isFinite(publishedAt) && publishedAt >= cutoff) {
          total += count;
        }
      }
      total += openChannels.get(gatewayId) ?? 0;
      total += Number(reservations[idx] ?? 0) || 0;
      scores.set(gatewayId, total);
    });

    return scores;
  };

  const getSuspect = async (gatewayIds: string[]) => {
    const suspect = new Set<string>();
    if (gatewayIds.length === 0) return suspect;
    const values = await keyStore.getItemsPrimary(gatewayIds.map((id) => suspectKey(id)));
    gatewayIds.forEach((gatewayId, idx) => {
      if (values[idx]) suspect.add(gatewayId);
    });
    return suspect;
  };

  const shutdown = () => {
    clearInterval(refreshTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const timer of reservationTimers) clearTimeout(timer);
    reservationTimers.clear();
  };

  tracker = {
    reserve,
    channelOpened,
    channelClosed,
    markSuspect,
    getScores,
    getSuspect,
    shutdown
  };

  return tracker;
};

export const getGatewayLoadTracker = () => tracker;
