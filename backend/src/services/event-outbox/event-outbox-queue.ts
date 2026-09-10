import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { resolveCoreMeter } from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TEventOutboxDALFactory } from "./event-outbox-dal";
import { TEventOutboxRegistry } from "./event-outbox-registry";
import { TEventOutboxServiceFactory } from "./event-outbox-service";
import { OUTBOX_RELAY_INTERVAL_MS, RELAY_DISCOVERY_LIMIT, TOutboxFlushKey } from "./event-outbox-types";

const FLUSH_WORKER_CONCURRENCY = 10;

const STALE_CLAIM_SWEEPER_CRON = "*/5 * * * *";
const CLEANUP_CRON = "*/15 * * * *";
const CRON_RUN_HASH_TTL_S = 60 * 60;

const RELAY_START_JITTER_MS = 5_000;

export type TEventOutboxQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
  eventOutboxRegistry: Pick<TEventOutboxRegistry, "names">;
  eventOutboxDAL: Pick<TEventOutboxDALFactory, "findDueFlushKeys" | "findOldestPendingAgeSeconds">;
  eventOutboxService: Pick<TEventOutboxServiceFactory, "drain" | "sweepStaleClaims" | "pruneTerminalRows">;
};

export const eventOutboxQueueFactory = ({
  queueService,
  cronJob,
  eventOutboxRegistry,
  eventOutboxDAL,
  eventOutboxService
}: TEventOutboxQueueFactoryDep) => {
  const appCfg = getConfig();

  let lastDiscoveryCount = 0;
  let oldestPendingByConsumer: { consumer: string; ageSeconds: number }[] = [];

  const $registerGauges = () => {
    const meter = resolveCoreMeter();

    const oldestPendingGauge = meter.createObservableGauge("infisical.event_outbox.oldest_pending_age", {
      description:
        "Age in seconds of the oldest undelivered outbox event, by consumer. Alarm when this exceeds a small multiple of the relay interval: it means events are being recorded but not delivered.",
      unit: "s"
    });
    oldestPendingGauge.addCallback((result) => {
      if (!getConfig().OTEL_TELEMETRY_COLLECTION_ENABLED) return;
      oldestPendingByConsumer.forEach(({ consumer, ageSeconds }) => {
        result.observe(ageSeconds, { "event_outbox.consumer": consumer });
      });
    });

    const discoveryGauge = meter.createObservableGauge("infisical.event_outbox.discovered", {
      description:
        "Flush keys found on the last relay tick (capped at the discovery limit). Sustained value at the cap means the drain rate cannot keep up.",
      unit: "{key}"
    });
    discoveryGauge.addCallback((result) => {
      if (!getConfig().OTEL_TELEMETRY_COLLECTION_ENABLED) return;
      result.observe(lastDiscoveryCount);
    });
  };

  const $enqueueFlush = async (key: TOutboxFlushKey) =>
    queueService.queue(QueueName.EventOutboxFlush, QueueJobs.EventOutboxFlush, key, {
      jobId: `outbox-flush-${key.consumer}-${key.resourceType}-${encodeURIComponent(key.resourceId)}`,
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 1
    });

  const runRelayTick = async () => {
    const keys = await eventOutboxDAL.findDueFlushKeys(RELAY_DISCOVERY_LIMIT, eventOutboxRegistry.names());
    lastDiscoveryCount = keys.length;

    if (keys.length === RELAY_DISCOVERY_LIMIT) {
      logger.warn(`event-outbox: relay discovery hit its cap of ${RELAY_DISCOVERY_LIMIT} keys; a backlog is building`);
    }

    if (keys.length > 0) {
      await Promise.all(keys.map((key) => $enqueueFlush(key)));
    }

    if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
      oldestPendingByConsumer = await eventOutboxDAL.findOldestPendingAgeSeconds();
    }
  };

  let relayTimer: NodeJS.Timeout | undefined;
  let startTimer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;

  const $tick = () => {
    if (inFlight) return;
    inFlight = runRelayTick()
      .catch((error) => {
        logger.error(error, "event-outbox: relay tick failed");
      })
      .finally(() => {
        inFlight = undefined;
      });
  };

  const init = () => {
    queueService.start(
      QueueName.EventOutboxFlush,
      async (job) => {
        const { consumer, resourceType, resourceId } = job.data;
        try {
          await eventOutboxService.drain({ consumer, resourceType, resourceId });
        } catch (error) {
          // The job is removeOnFail with a single attempt, so this line is the only trace it leaves.
          logger.error(
            error,
            `event-outbox: flush worker crashed [consumer=${consumer}] [resourceType=${resourceType}] [resourceId=${resourceId}]`
          );
          throw error;
        }
      },
      { concurrency: FLUSH_WORKER_CONCURRENCY }
    );

    cronJob.register({
      name: CronJobName.EventOutboxStaleClaimSweeper,
      pattern: STALE_CLAIM_SWEEPER_CRON,
      runHashTtlS: CRON_RUN_HASH_TTL_S,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        await eventOutboxService.sweepStaleClaims();
      }
    });

    cronJob.register({
      name: CronJobName.EventOutboxCleanup,
      pattern: CLEANUP_CRON,
      runHashTtlS: CRON_RUN_HASH_TTL_S,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        await eventOutboxService.pruneTerminalRows();
      }
    });

    if (!appCfg.isGeneralWorkerRunModeEnabled || appCfg.isSecondaryInstance) return;

    $registerGauges();
    startTimer = setTimeout(
      () => {
        $tick();
        relayTimer = setInterval($tick, OUTBOX_RELAY_INTERVAL_MS);
      },
      Math.floor(Math.random() * RELAY_START_JITTER_MS)
    );
  };

  const shutdown = async () => {
    if (startTimer) clearTimeout(startTimer);
    if (relayTimer) clearInterval(relayTimer);
    startTimer = undefined;
    relayTimer = undefined;
    await inFlight;
  };

  return { init, shutdown, runRelayTick };
};

export type TEventOutboxQueueFactory = ReturnType<typeof eventOutboxQueueFactory>;
