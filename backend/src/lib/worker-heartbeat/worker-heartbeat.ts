import { randomUUID } from "node:crypto";

import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";
import { RunMode } from "@app/lib/types";

const DEFAULTS = {
  // Refreshed well inside KeyStoreTtls.WorkerHeartbeatInSeconds so a few missed beats (a GC pause,
  // a slow Redis round trip) don't make a healthy worker look gone.
  reportIntervalMs: 60_000,
  monitorIntervalMs: 5 * 60_000,
  // Grace before the first check: an API pod usually boots alongside its workers, and they may
  // still be running migrations when it comes up.
  monitorInitialDelayMs: 60_000
} as const;

const missingWorkerError = (workerType: RunMode) =>
  `no "${workerType}" instances detected. Background jobs (secret syncs, rotations, and others) will be queued but never executed. Add "${workerType}" to the "INFISICAL_RUN_MODES" environment variable of this instance, or deploy a separate instance with that run mode.`;

type TWorkerHeartbeatKeyStore = Pick<
  TKeyStoreFactory,
  "setIndexedItemWithExpiry" | "sortedSetRangeByScore" | "deleteIndexedItems"
>;

export type TWorkerHeartbeatFactory = ReturnType<typeof workerHeartbeatFactory>;

/**
 * Tracks which worker fleets are alive so an API-only deployment can tell the user when nothing is
 * consuming its queues. Each reporting pod keeps a member in a per-worker-type sorted set scored by
 * its heartbeat deadline, plus a small payload key with the same TTL; readers only count members
 * whose deadline hasn't passed, so a dead pod drops out on its own.
 */
export const workerHeartbeatFactory = ({
  keyStore,
  reportIntervalMs = DEFAULTS.reportIntervalMs,
  monitorIntervalMs = DEFAULTS.monitorIntervalMs,
  monitorInitialDelayMs = DEFAULTS.monitorInitialDelayMs
}: {
  keyStore: TWorkerHeartbeatKeyStore;
  reportIntervalMs?: number;
  monitorIntervalMs?: number;
  monitorInitialDelayMs?: number;
}) => {
  const instanceId = randomUUID();
  const reportedTypes = new Set<RunMode>();
  const monitoredTypes = new Set<RunMode>();
  let reportTimer: ReturnType<typeof setInterval> | null = null;
  let monitorTimer: ReturnType<typeof setInterval> | null = null;
  let monitorDelayTimer: ReturnType<typeof setTimeout> | null = null;

  const report = async (workerType: RunMode) =>
    keyStore.setIndexedItemWithExpiry({
      indexKey: KeyStorePrefixes.WorkerHeartbeatIndex(workerType),
      member: instanceId,
      itemKey: KeyStorePrefixes.WorkerHeartbeat(workerType, instanceId),
      value: JSON.stringify({ instanceId, reportedAt: new Date().toISOString() }),
      expiryInSeconds: KeyStoreTtls.WorkerHeartbeatInSeconds,
      indexed: true
    });

  const reportAll = async () => {
    for (const workerType of reportedTypes) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await report(workerType);
      } catch (err) {
        logger.error({ err }, `worker heartbeat: failed to report "${workerType}" heartbeat`);
      }
    }
  };

  const getActiveInstanceIds = async (workerType: RunMode) =>
    keyStore.sortedSetRangeByScore(KeyStorePrefixes.WorkerHeartbeatIndex(workerType), Date.now(), "+inf");

  const checkAll = async () => {
    for (const workerType of monitoredTypes) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const instanceIds = await getActiveInstanceIds(workerType);
        if (!instanceIds.length) logger.error(missingWorkerError(workerType));
      } catch (err) {
        logger.error({ err }, `worker heartbeat: failed to check for "${workerType}" instances`);
      }
    }
  };

  /**
   * Marks this pod as a live instance of `workerType`. Call once per fleet the pod consumes.
   */
  const startReporting = (workerType: RunMode) => {
    reportedTypes.add(workerType);
    void reportAll();
    if (reportTimer) return;
    reportTimer = setInterval(() => void reportAll(), reportIntervalMs);
  };

  /**
   * Logs an error whenever no instance of `workerType` is reporting. Only observes — a deployment
   * missing its workers still serves API traffic, so this must never fail a health check.
   */
  const startMonitoring = (workerType: RunMode) => {
    monitoredTypes.add(workerType);
    if (monitorTimer || monitorDelayTimer) return;
    monitorDelayTimer = setTimeout(() => {
      monitorDelayTimer = null;
      void checkAll();
      monitorTimer = setInterval(() => void checkAll(), monitorIntervalMs);
    }, monitorInitialDelayMs);
  };

  // Drops this pod's members so a graceful shutdown is visible immediately instead of after the TTL.
  const stop = async () => {
    if (reportTimer) clearInterval(reportTimer);
    if (monitorTimer) clearInterval(monitorTimer);
    if (monitorDelayTimer) clearTimeout(monitorDelayTimer);
    reportTimer = null;
    monitorTimer = null;
    monitorDelayTimer = null;

    for (const workerType of reportedTypes) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await keyStore.deleteIndexedItems({
          indexKey: KeyStorePrefixes.WorkerHeartbeatIndex(workerType),
          members: [instanceId],
          itemKeys: [KeyStorePrefixes.WorkerHeartbeat(workerType, instanceId)]
        });
      } catch (err) {
        logger.error({ err }, `worker heartbeat: failed to clear "${workerType}" heartbeat`);
      }
    }
    reportedTypes.clear();
    monitoredTypes.clear();
  };

  return { startReporting, startMonitoring, getActiveInstanceIds, stop };
};
