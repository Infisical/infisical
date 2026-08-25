import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";

import { logger } from "../logger";

// A reservation marks a gateway as chosen until its channel opens, so concurrent selections do not
// all read the same stale count and stampede one member.
const RESERVATION_TTL_SECONDS = 240;
// Must outlast a relay dial (100s) plus a gateway handshake (120s), or the window reopens.
const RESERVATION_HOLD_MS = 230_000;
const SUSPECT_TTL_SECONDS = 60;

export type TGatewayScore = {
  /** Occupancy without reservations; the claim script reads those keys itself. */
  base: number;
  /** False when this member is too old to report, which disables load-aware selection. */
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
  // Timestamps rather than a count, so channels opened since a gateway's last report can be added on top.
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
    // The channel now carries the load the reservation stood in for; holding both double counts.
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
    open?.shift();
    if (!open?.length) openChannels.delete(gatewayId);
  };

  const reserve = async (gatewayId: string) => {
    try {
      // Same claim path as a selection, so the expiry is set only on the first increment. Refreshing
      // it every call means a busy key never elapses and a dead pod's reservations persist.
      await keyStore.claimLeastLoaded([reservationKey(gatewayId)], [0], RESERVATION_TTL_SECONDS);
    } catch (err) {
      logger.debug({ err, gatewayId }, `Failed to reserve gateway capacity [gatewayId=${gatewayId}]`);
      return;
    }
    trackReservationRelease(gatewayId);
  };

  /** Ties fall to the caller's ordering, so callers shuffle first for a random tie-break. */
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

      // Left at zero on purpose: selection refuses to compare a pool containing one, so a
      // platform-side count here would only look like a real occupancy without being one.
      let occupancy = 0;
      if (report) {
        // Without this every selection inside one report interval reads the same stale count.
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

  // Reservations still held are left to their TTL, which exists for exactly this case.
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
