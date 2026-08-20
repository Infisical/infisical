import crypto from "node:crypto";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";

import { logger } from "../logger";

// A reservation bridges the gap between choosing a gateway and its channel actually opening, so two
// concurrent selections cannot both read a stale zero and stampede the same member. It only has to
// span a relay dial plus two TLS handshakes, and it is released explicitly: left to expire on its
// own the counter would behave like "selections in the last N seconds", which is request-count
// round-robin rather than the occupancy signal this is supposed to be.
const RESERVATION_TTL_SECONDS = 240;
// Backstop only, for a selection whose channel never opens. The relay dial allows 100s and the
// gateway handshake 120s, so releasing sooner would reopen the window the reservation covers.
const RESERVATION_HOLD_MS = 230_000;
const SUSPECT_TTL_SECONDS = 60;
const LOAD_HASH_TTL_SECONDS = 600;

// Another pod's published count is ignored past this age, so a pod that dies stops skewing selection
// instead of leaving its channels counted forever.
const PUBLISHED_COUNT_MAX_AGE_MS = 90_000;
const PUBLISH_DEBOUNCE_MS = 250;
const PUBLISH_REFRESH_MS = 20_000;

const podId = crypto.randomUUID();

export type TGatewayScore = {
  score: number;
  /** Occupancy excluding reservations, which the atomic claim reads for itself. */
  base: number;
  /** False when this member is too old to report its own count, so its score is on a different scale. */
  reported: boolean;
};

type TGatewayLoadTracker = {
  recordReportedLoad: (gatewayId: string, activeChannels: number) => Promise<void>;
  reserve: (gatewayId: string) => Promise<void>;
  claimLeastLoaded: (candidates: { id: string; base: number }[]) => Promise<string | undefined>;
  channelOpened: (gatewayId: string) => void;
  channelClosed: (gatewayId: string) => void;
  markSuspect: (gatewayId: string) => Promise<void>;
  getScores: (gatewayIds: string[]) => Promise<Map<string, TGatewayScore>>;
  getSuspect: (gatewayIds: string[]) => Promise<Set<string>>;
  shutdown: () => Promise<void>;
};

let tracker: TGatewayLoadTracker | undefined;

const REPORTED_LOAD_TTL_SECONDS = 60;
const REPORTED_LOAD_MAX_AGE_MS = 35_000;

const loadKey = KeyStorePrefixes.GatewayLoad;
const reportedKey = KeyStorePrefixes.GatewayReportedLoad;
const reservationKey = KeyStorePrefixes.GatewayLoadReservation;
const suspectKey = KeyStorePrefixes.GatewaySuspect;

export const initGatewayLoadTracker = (keyStore: TKeyStoreFactory): TGatewayLoadTracker => {
  // Open timestamps rather than a bare count, so a channel opened since a gateway's last report can
  // be added on top of that report instead of being invisible until the next one lands.
  const openChannels = new Map<string, number[]>();
  const pendingPublish = new Set<string>();
  const reservationTimers = new Set<NodeJS.Timeout>();
  const pendingReservations = new Map<string, NodeJS.Timeout[]>();
  let debounceTimer: NodeJS.Timeout | undefined;

  const publishChain = new Map<string, Promise<void>>();

  const channelCount = (gatewayId: string) => openChannels.get(gatewayId)?.length ?? 0;

  const releaseReservation = async (gatewayId: string) => {
    try {
      await keyStore.decrementByOrDelete(reservationKey(gatewayId));
    } catch (err) {
      logger.debug({ err, gatewayId }, `Failed to release gateway reservation [gatewayId=${gatewayId}]`);
    }
  };

  // The key TTL is only a backstop for a pod that dies holding reservations; the channel handoff or
  // this timer is what normally releases them.
  function trackReservationRelease(gatewayId: string) {
    const timer = setTimeout(() => {
      reservationTimers.delete(timer);
      const queue = pendingReservations.get(gatewayId);
      const idx = queue?.indexOf(timer) ?? -1;
      if (queue && idx >= 0) queue.splice(idx, 1);
      void releaseReservation(gatewayId);
    }, RESERVATION_HOLD_MS);
    timer.unref();
    reservationTimers.add(timer);
    const queue = pendingReservations.get(gatewayId);
    if (queue) queue.push(timer);
    else pendingReservations.set(gatewayId, [timer]);
  }

  const publishNow = async (gatewayId: string) => {
    const count = channelCount(gatewayId);
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

  // Overlapping flushes must not interleave, or a hashSet for count 1 can land after the hashDelete
  // for count 0 and leave this pod's field claiming load it does not hold.
  const publish = (gatewayId: string) => {
    const prev = publishChain.get(gatewayId) ?? Promise.resolve();
    const next = prev.then(() => publishNow(gatewayId));
    publishChain.set(gatewayId, next);
    return next;
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

  const recordReportedLoad = async (gatewayId: string, activeChannels: number) => {
    await keyStore.setItemWithExpiry(
      reportedKey(gatewayId),
      REPORTED_LOAD_TTL_SECONDS,
      `${activeChannels}:${Date.now()}`
    );
  };

  const channelOpened = (gatewayId: string) => {
    const open = openChannels.get(gatewayId);
    if (open) open.push(Date.now());
    else openChannels.set(gatewayId, [Date.now()]);
    // The channel now carries the load the reservation was standing in for. Holding both would
    // double count the member for the rest of the backstop window.
    const pending = pendingReservations.get(gatewayId);
    const timer = pending?.shift();
    if (timer) {
      clearTimeout(timer);
      reservationTimers.delete(timer);
      void releaseReservation(gatewayId);
    }
    schedulePublish(gatewayId);
  };

  const channelClosed = (gatewayId: string) => {
    const open = openChannels.get(gatewayId);
    // Drops the oldest: only the count and the open times matter, not which socket this was.
    open?.shift();
    if (!open?.length) openChannels.delete(gatewayId);
    schedulePublish(gatewayId);
  };

  const reserve = async (gatewayId: string) => {
    try {
      // Routed through the same claim path as a pool selection so the expiry is set only on the
      // first increment. incrementByWithExpiry refreshes it on every call, which on a busy gateway
      // means the key never elapses and a crashed pod's reservations stay counted forever.
      await keyStore.claimLeastLoaded([reservationKey(gatewayId)], [0], RESERVATION_TTL_SECONDS);
    } catch (err) {
      logger.debug({ err, gatewayId }, `Failed to reserve gateway capacity [gatewayId=${gatewayId}]`);
      return;
    }
    trackReservationRelease(gatewayId);
  };

  /**
   * Picks and claims in one round trip. Ties fall to the caller's ordering, so the caller shuffles
   * first to keep the random tie-break that stops every pod choosing the same idle member.
   */
  const claimLeastLoaded = async (candidates: { id: string; base: number }[]) => {
    if (candidates.length === 0) return undefined;
    const idx = await keyStore.claimLeastLoaded(
      candidates.map((c) => reservationKey(c.id)),
      candidates.map((c) => c.base),
      RESERVATION_TTL_SECONDS
    );
    if (idx < 1 || idx > candidates.length) return undefined;
    const claimed = candidates[idx - 1].id;
    trackReservationRelease(claimed);
    return claimed;
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
    const scores = new Map<string, TGatewayScore>();
    if (gatewayIds.length === 0) return scores;

    const [published, reservations, reported] = await Promise.all([
      Promise.all(gatewayIds.map((id) => keyStore.hashGetAll(loadKey(id)))),
      keyStore.getItemsPrimary(gatewayIds.map((id) => reservationKey(id))),
      keyStore.getItemsPrimary(gatewayIds.map((id) => reportedKey(id)))
    ]);

    const now = Date.now();
    const publishedCutoff = now - PUBLISHED_COUNT_MAX_AGE_MS;
    const reportedCutoff = now - REPORTED_LOAD_MAX_AGE_MS;

    const parseStamped = (raw: string | null, cutoff: number) => {
      if (!raw) return undefined;
      const [countStr, tsStr] = raw.split(":");
      const count = Number(countStr);
      const at = Number(tsStr);
      if (!Number.isFinite(count) || !Number.isFinite(at) || at < cutoff) return undefined;
      return count;
    };

    gatewayIds.forEach((gatewayId, idx) => {
      // Never sum the two views: the gateway's own count already includes the channels this pod
      // opened, so adding the per-pod counters would double count platform traffic.
      const rawReported = reported[idx];
      const reportedOccupancy = parseStamped(rawReported, reportedCutoff);
      let occupancy = reportedOccupancy;

      if (occupancy !== undefined) {
        // The report is a snapshot up to its own timestamp. Anything this pod opened since then is
        // not in it yet, and without this every selection inside one report interval reads the same
        // stale number and piles onto the same member.
        const reportedAt = Number((rawReported ?? "").split(":")[1]);
        const openedSinceReport = Number.isFinite(reportedAt)
          ? (openChannels.get(gatewayId) ?? []).filter((openedAt) => openedAt > reportedAt).length
          : 0;
        occupancy += openedSinceReport;
      } else {
        const fields = Object.entries(published[idx] ?? {})
          // This pod's in-memory count is always fresher than what it last published.
          .filter(([fieldPodId]) => fieldPodId !== podId);

        occupancy = 0;
        for (const [, raw] of fields) {
          occupancy += parseStamped(raw, publishedCutoff) ?? 0;
        }
        occupancy += channelCount(gatewayId);
      }

      scores.set(gatewayId, {
        base: occupancy,
        score: occupancy + (Number(reservations[idx] ?? 0) || 0),
        reported: reportedOccupancy !== undefined
      });
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

  const shutdown = async () => {
    tracker = undefined;
    clearInterval(refreshTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const timer of reservationTimers) clearTimeout(timer);
    pendingReservations.clear();
    reservationTimers.clear();
    publishChain.clear();

    // Without this the published fields linger for the freshness window, so a rolling deploy leaves
    // this pod's already-dead channels counting against those gateways.
    const held = [...openChannels.keys()];
    openChannels.clear();
    await Promise.all(
      held.map(async (gatewayId) => {
        try {
          await keyStore.hashDelete(loadKey(gatewayId), podId);
        } catch (err) {
          logger.debug({ err, gatewayId }, `Failed to clear published load on shutdown [gatewayId=${gatewayId}]`);
        }
      })
    );
  };

  tracker = {
    recordReportedLoad,
    reserve,
    claimLeastLoaded,
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
