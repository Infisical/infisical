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

export type TGatewayScore = {
  /**
   * Occupancy without reservations. The claim script reads the reservation keys itself, so adding
   * them here as well would mean fetching them twice for the same decision.
   */
  base: number;
  /** False when this member is too old to report its own count, which disables load-aware selection. */
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
  shutdown: () => void;
};

let tracker: TGatewayLoadTracker | undefined;

const REPORTED_LOAD_TTL_SECONDS = 60;
const REPORTED_LOAD_MAX_AGE_MS = 35_000;

const reportedKey = KeyStorePrefixes.GatewayReportedLoad;
const reservationKey = KeyStorePrefixes.GatewayLoadReservation;
const suspectKey = KeyStorePrefixes.GatewaySuspect;

export const initGatewayLoadTracker = (keyStore: TKeyStoreFactory): TGatewayLoadTracker => {
  // Open timestamps rather than a bare count, so a channel opened since a gateway's last report can
  // be added on top of that report instead of being invisible until the next one lands.
  const openChannels = new Map<string, number[]>();
  const reservationTimers = new Set<NodeJS.Timeout>();
  const pendingReservations = new Map<string, NodeJS.Timeout[]>();

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
  };

  const channelClosed = (gatewayId: string) => {
    const open = openChannels.get(gatewayId);
    // Drops the oldest: only the count and the open times matter, not which socket this was.
    open?.shift();
    if (!open?.length) openChannels.delete(gatewayId);
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

    const reported = await keyStore.getItemsPrimary(gatewayIds.map((id) => reportedKey(id)));

    const reportedCutoff = Date.now() - REPORTED_LOAD_MAX_AGE_MS;

    const parseStamped = (raw: string | null) => {
      if (!raw) return undefined;
      const [countStr, tsStr] = raw.split(":");
      const count = Number(countStr);
      const at = Number(tsStr);
      if (!Number.isFinite(count) || !Number.isFinite(at) || at < reportedCutoff) return undefined;
      return { count, at };
    };

    gatewayIds.forEach((gatewayId, idx) => {
      const report = parseStamped(reported[idx]);

      // A gateway that cannot report is left at zero on purpose. Selection refuses to compare a pool
      // containing one, so the number is never used, and inventing a platform-side count here would
      // only look like a real occupancy to whoever reads it next.
      let occupancy = 0;
      if (report) {
        // The report is a snapshot up to its own timestamp. Anything this pod opened since then is
        // not in it yet, and without this every selection inside one report interval reads the same
        // stale number and piles onto the same member.
        const openedSinceReport = (openChannels.get(gatewayId) ?? []).filter((openedAt) => openedAt > report.at).length;
        occupancy = report.count + openedSinceReport;
      }

      scores.set(gatewayId, { base: occupancy, reported: report !== undefined });
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

  // Nothing here writes to Redis. Reservations this pod still holds are left to their TTL, which is
  // the backstop that exists precisely for a pod that goes away without releasing them.
  const shutdown = () => {
    tracker = undefined;
    for (const timer of reservationTimers) clearTimeout(timer);
    pendingReservations.clear();
    reservationTimers.clear();
    openChannels.clear();
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
