import { createHash, randomUUID } from "node:crypto";

import { CronExpressionParser } from "cron-parser";
import { Cluster, Redis } from "ioredis";
import RE2 from "re2";

import { logger } from "@app/lib/logger";
import { ExecutionError, Redlock, ResourceLockedError } from "@app/lib/red-lock";

export const CronJobName = {
  HealthAlert: "health-alert",
  KmsRootKeyCleanup: "kms-root-key-cleanup",
  DailyReminders: "daily-reminders",
  DailyResourceCleanup: "daily-resource-cleanup",
  DailySecretVersionCleanup: "daily-secret-version-cleanup",
  DailyAuditLogCleanup: "daily-audit-log-cleanup",
  DailyResourceNotification: "daily-resource-notification",
  FrequentResourceCleanup: "frequent-resource-cleanup",
  AgentVaultSessionSweep: "agent-vault-session-sweep",
  CertificateCleanup: "certificate-cleanup",
  CertificateV3AutoRenewal: "certificate-v3-auto-renewal",
  CaDailyAutoRenewal: "ca-daily-auto-renewal",
  DailyExpiringPkiItemAlert: "daily-expiring-pki-item-alert",
  DailyPkiAlertV2Processing: "daily-pki-alert-v2-processing",
  PkiSyncCleanup: "pki-sync-cleanup",
  PkiSyncHealthCheck: "pki-sync-health-check",
  PkiSubscriberDailyAutoRenewal: "pki-subscriber-daily-auto-renewal",
  PkiDiscoveryScheduledScan: "pki-discovery-scheduled-scan",
  PamDiscoveryScheduledScan: "pam-discovery-scheduled-scan",
  DailySecretSyncRetry: "daily-secret-sync-retry",
  SecretRotationV2QueueRotations: "secret-rotation-v2-queue-rotations",
  AppConnectionCredentialRotationQueueRotations: "app-connection-credential-rotation-queue-rotations",
  TelemetryInstanceStats: "telemetry-instance-stats",
  TelemetryAggregatedEvents: "telemetry-aggregated-events",
  DigiCertOrderPolling: "digicert-order-polling",
  ProjectEnvHardDelete: "project-env-hard-delete",
  ProjectHardDelete: "project-hard-delete",
  DigiCertRevocationSync: "digicert-revocation-sync",
  GoDaddyOrderPolling: "godaddy-order-polling",
  CaCrlRotation: "ca-crl-rotation",
  SignerDailyAutoRenewal: "signer-daily-auto-renewal",
  SignerIssuancePolling: "signer-issuance-polling",
  AuditLogStreamOutboxStaleClaimSweeper: "audit-log-stream-outbox-stale-claim-sweeper",
  AuditLogStreamOutboxCleanup: "audit-log-stream-outbox-cleanup",
  LicenseUsageFlush: "license-usage-flush",
  PamCredentialRotationQueueRotations: "pam-credential-rotation-queue-rotations",
  PamHeartbeatQueueChecks: "pam-heartbeat-queue-checks",
  MonthlyNativeIntegrationDeprecationNotice: "monthly-native-integration-deprecation-notice",
  DailyAlertProcessing: "daily-alert-processing",
  EventOutboxStaleClaimSweeper: "event-outbox-stale-claim-sweeper",
  EventOutboxCleanup: "event-outbox-cleanup",
  SecretScanningStuckScanReaper: "secret-scanning-stuck-scan-reaper",
  InstanceUpdateCheck: "instance-update-check"
} as const;

const JITTER_INTERVAL_FRACTION = 0.25; // keep below ~0.48 so 30s retry fits before next 1-min fire
const CRON_FIELD_COUNT = 5;
const CRON_FIELD_SEPARATOR = new RE2(/\s+/);
const PARTICIPANT_SLOTS = 5;
const PROCESS_BATCH_SIZE = 50;
const NEXT_FIRE_BUFFER_MS = 1_000; // shared margin for fitsBeforeNextFire and jitterWindowMs
const ERROR_MESSAGE_MAX_LEN = 4_000;

const DEFAULTS = {
  slotTtlMs: 60_000,
  slotRefreshMs: 30_000,
  enqueueIntervalMs: 30_000,
  processIntervalMs: 5_000,
  minProcessAgeMs: 1_000,
  leaseDurationMs: 5 * 60_000,
  handlerTimeoutMs: 5 * 60_000,
  retryBackoffBaseMs: 30_000,
  retryBackoffMaxMs: 5 * 60_000,
  drainTimeoutMs: 25_000,
  maxJitterMs: 5 * 60_000
} as const;

const KEY_HASH_TAG = "{cron}";

const RunStatus = {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed"
} as const;

const F = {
  Name: "name",
  Status: "status",
  Attempts: "attempts",
  WorkerId: "worker_id",
  ScheduledAt: "scheduled_at",
  EnqueuedAtMs: "enqueued_at_ms",
  StartedAt: "started_at",
  CompletedAt: "completed_at",
  LastError: "last_error",
  NextAttemptAt: "next_attempt_at"
} as const;

// ARGV[2] = unjittered scheduled_at; ARGV[6] = eligibleAt (pending zset score).
const ENQUEUE_RUN_LUA = `
  if redis.call('exists', KEYS[1]) == 0 then
    redis.call('hset', KEYS[1],
      'name', ARGV[1],
      'scheduled_at', ARGV[2],
      'status', 'pending',
      'attempts', 0,
      'enqueued_at_ms', ARGV[5])
    redis.call('expire', KEYS[1], ARGV[3])
    redis.call('zadd', KEYS[2], ARGV[6], ARGV[4])
    return 1
  end
  return 0
`;

// Release slot only if we still own it (stale stop() after TTL expiry).
const RELEASE_SLOT_IF_MINE_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

type Handler = () => Promise<void>;
type CronEntry = {
  name: string;
  pattern: string;
  maxAttempts: number;
  handler: Handler;
  runHashTtlS: number;
  handlerTimeoutMs?: number;
  leaseDurationMs?: number;
};
class HandlerTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandlerTimeoutError";
  }
}

// Multi-key EVAL requires all keys in one Redis Cluster slot.
const assertHashTagged = (keyPrefix: string) => {
  const start = keyPrefix.indexOf("{");
  const end = keyPrefix.indexOf("}", start + 1);
  if (start < 0 || end <= start + 1) {
    throw new Error(`cron: keyPrefix "${keyPrefix}" must contain a non-empty Redis Cluster hash tag, e.g. "{cron}"`);
  }
};

export type TCronJobFactory = ReturnType<typeof cronJobFactory>;

export const cronJobFactory = ({
  redis,
  redlock,
  slotTtlMs = DEFAULTS.slotTtlMs,
  slotRefreshMs = DEFAULTS.slotRefreshMs,
  enqueueIntervalMs = DEFAULTS.enqueueIntervalMs,
  processIntervalMs = DEFAULTS.processIntervalMs,
  minProcessAgeMs = DEFAULTS.minProcessAgeMs,
  leaseDurationMs = DEFAULTS.leaseDurationMs,
  handlerTimeoutMs = DEFAULTS.handlerTimeoutMs,
  retryBackoffBaseMs = DEFAULTS.retryBackoffBaseMs,
  retryBackoffMaxMs = DEFAULTS.retryBackoffMaxMs,
  drainTimeoutMs = DEFAULTS.drainTimeoutMs,
  maxJitterMs = DEFAULTS.maxJitterMs,
  keyPrefix = KEY_HASH_TAG,
  schedulingEnabled = true
}: {
  redis: Redis | Cluster;
  redlock: Redlock;
  slotTtlMs?: number;
  slotRefreshMs?: number;
  enqueueIntervalMs?: number;
  processIntervalMs?: number;
  minProcessAgeMs?: number;
  leaseDurationMs?: number;
  handlerTimeoutMs?: number;
  retryBackoffBaseMs?: number;
  retryBackoffMaxMs?: number;
  drainTimeoutMs?: number;
  /**
   * 0 disables jitter (dev wiring).
   */
  maxJitterMs?: number;
  /**
   * Must include a Redis Cluster hash tag; tests override to avoid slot collisions.
   */
  keyPrefix?: string;
  /**
   * When false, register is a no-op (api-only pods).
   */
  schedulingEnabled?: boolean;
}) => {
  assertHashTagged(keyPrefix);
  if (!Number.isFinite(maxJitterMs) || maxJitterMs < 0) {
    throw new Error(`cron: maxJitterMs (${maxJitterMs}) must be a non-negative number`);
  }

  const SLOT_KEY = (i: number) => `${keyPrefix}:slot:${i}`;
  const RUN_KEY = (id: string) => `${keyPrefix}:run:${id}`;
  const LEASE_KEY = (id: string) => `${keyPrefix}:lease:${id}`;
  const PENDING_ZSET = `${keyPrefix}:pending`;

  if (!schedulingEnabled) {
    logger.info("cron: scheduling disabled for this run mode, skipping every registration");
  }

  const workerId = randomUUID();
  const entries = new Map<string, CronEntry>();
  const lastEnqueuedAt = new Map<string, number>();
  const inFlight = new Set<Promise<unknown>>();
  let slotTimer: ReturnType<typeof setInterval> | null = null;
  let enqueueTimer: ReturnType<typeof setInterval> | null = null;
  let processTimer: ReturnType<typeof setInterval> | null = null;
  let currentSlot: number | null = null;
  let stopped = false;
  let slotOp: Promise<void> = Promise.resolve(); // serialized slot claim chain

  const prevFireMs = (pattern: string) => CronExpressionParser.parse(pattern, { tz: "UTC" }).prev().toDate().getTime();

  const nextFireMs = (pattern: string) => CronExpressionParser.parse(pattern, { tz: "UTC" }).next().toDate().getTime();

  const jitterWindowMs = (intervalMs: number) =>
    Math.min(intervalMs * JITTER_INTERVAL_FRACTION, maxJitterMs, Math.max(0, intervalMs - NEXT_FIRE_BUFFER_MS));

  // Hash, not random: every pod must derive the same eligibleAt for dedup/leases.
  const jitterOffsetMs = (name: string, windowMs: number) => {
    if (windowMs <= 0) return 0;
    return createHash("sha256").update(name).digest().readUIntBE(0, 6) % windowMs;
  };

  const eligibleAtMs = (entry: CronEntry, scheduledAt: number, nextFire: number) => {
    const windowMs = jitterWindowMs(nextFire - scheduledAt);
    return scheduledAt + jitterOffsetMs(entry.name, windowMs);
  };

  const shuffleInPlace = <T>(arr: T[]): void => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      // eslint-disable-next-line no-param-reassign
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  // Timeout → failed-final, not retry (handler may still be running as a zombie).
  const withTimeout = async (task: () => Promise<void>, timeoutMs: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new HandlerTimeoutError(`handler exceeded ${timeoutMs}ms`));
      }, timeoutMs);
    });
    const taskPromise = task();
    try {
      await Promise.race([taskPromise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
      // Nothing waits on the handler after a timeout, so absorb its eventual rejection.
      taskPromise.catch(() => {});
    }
  };

  const markRunning = (id: string, attempt: number) =>
    redis.hset(
      RUN_KEY(id),
      F.Status,
      RunStatus.Running,
      F.WorkerId,
      workerId,
      F.StartedAt,
      String(Date.now()),
      F.Attempts,
      String(attempt)
    );

  const markCompleted = async (id: string) => {
    await redis.hset(RUN_KEY(id), F.Status, RunStatus.Completed, F.CompletedAt, String(Date.now()));
    await redis.zrem(PENDING_ZSET, id);
  };

  const markFailedFinal = async (id: string, err?: unknown) => {
    if (err === undefined) {
      await redis.hset(RUN_KEY(id), F.Status, RunStatus.Failed, F.CompletedAt, String(Date.now()));
    } else {
      await redis.hset(
        RUN_KEY(id),
        F.Status,
        RunStatus.Failed,
        F.LastError,
        String(err).slice(0, ERROR_MESSAGE_MAX_LEN),
        F.CompletedAt,
        String(Date.now())
      );
    }
    await redis.zrem(PENDING_ZSET, id);
  };

  const markPendingRetry = async (id: string, err: unknown, nextAttemptAt: number) => {
    await redis.hset(
      RUN_KEY(id),
      F.Status,
      RunStatus.Pending,
      F.LastError,
      String(err).slice(0, ERROR_MESSAGE_MAX_LEN),
      F.NextAttemptAt,
      String(nextAttemptAt)
    );
    await redis.zadd(PENDING_ZSET, nextAttemptAt, id);
  };

  const register = ({
    name,
    pattern,
    handler,
    runHashTtlS,
    maxAttempts = 3,
    enabled = true,
    handlerTimeoutMs: entryHandlerTimeoutMs,
    leaseDurationMs: entryLeaseDurationMs
  }: {
    name: string;
    pattern: string;
    handler: Handler;
    runHashTtlS: number;
    maxAttempts?: number;
    enabled?: boolean;
    handlerTimeoutMs?: number;
    leaseDurationMs?: number;
  }) => {
    if (!schedulingEnabled) return;

    if (!enabled) {
      logger.info(`cron[${name}]: disabled`);
      return;
    }
    if (entries.has(name)) throw new Error(`cron[${name}] already registered`);
    CronExpressionParser.parse(pattern, { tz: "UTC" }); // validate at registration
    if (pattern.trim().split(CRON_FIELD_SEPARATOR).length !== CRON_FIELD_COUNT) {
      throw new Error(
        `cron[${name}] pattern "${pattern}" must have ${CRON_FIELD_COUNT} fields. The cron manager schedules at minute granularity; sub-minute work belongs on a setInterval or a queue`
      );
    }

    if (runHashTtlS * 1000 <= maxJitterMs) {
      throw new Error(
        `cron[${name}] runHashTtlS (${runHashTtlS}s) must exceed the maximum jitter window (${Math.round(
          maxJitterMs / 1000
        )}s), otherwise the run hash can expire before the run is picked up`
      );
    }

    const effectiveHandlerTimeoutMs = entryHandlerTimeoutMs ?? handlerTimeoutMs;
    const effectiveLeaseDurationMs = entryLeaseDurationMs ?? leaseDurationMs;
    if (effectiveHandlerTimeoutMs > effectiveLeaseDurationMs) {
      throw new Error(
        `cron[${name}] handlerTimeoutMs (${effectiveHandlerTimeoutMs}) must be <= leaseDurationMs (${effectiveLeaseDurationMs})`
      );
    }

    entries.set(name, {
      name,
      pattern,
      maxAttempts,
      handler,
      runHashTtlS,
      handlerTimeoutMs: entryHandlerTimeoutMs,
      leaseDurationMs: entryLeaseDurationMs
    });
    logger.info(`cron[${name}]: registered (pattern="${pattern}")`);
  };

  const claimOrRefreshSlot = async () => {
    if (currentSlot !== null) {
      const ok = await redis.set(SLOT_KEY(currentSlot), workerId, "PX", slotTtlMs, "XX");
      if (ok) return;
      logger.info(`cron: lost slot ${currentSlot} [worker=${workerId}]`);
      currentSlot = null;
    }
    for (let i = 0; i < PARTICIPANT_SLOTS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const got = await redis.set(SLOT_KEY(i), workerId, "PX", slotTtlMs, "NX");
      if (got) {
        currentSlot = i;
        logger.info(`cron: claimed slot ${i} [worker=${workerId}]`);
        return;
      }
    }
  };

  // Serialize slot ops: overlapping ticks could claim two slots and leak one on shutdown.
  const runSlotOp = (label: string) => {
    slotOp = slotOp
      .then(() => (stopped ? undefined : claimOrRefreshSlot()))
      .catch((err: unknown) => logger.error({ err }, `cron: ${label} failed`));
    return slotOp;
  };

  // Run id uses unjittered scheduledAt; pending zset score carries eligibleAt.
  const enqueueDueFires = async () => {
    for (const entry of entries.values()) {
      const scheduledAt = prevFireMs(entry.pattern);
      // eslint-disable-next-line no-continue
      if (lastEnqueuedAt.get(entry.name) === scheduledAt) continue;

      const id = `${entry.name}:${scheduledAt}`;
      const eligibleAt = eligibleAtMs(entry, scheduledAt, nextFireMs(entry.pattern));
      // eslint-disable-next-line no-await-in-loop
      const initialized = await redis.eval(
        ENQUEUE_RUN_LUA,
        2,
        RUN_KEY(id),
        PENDING_ZSET,
        entry.name,
        String(scheduledAt),
        String(entry.runHashTtlS),
        id,
        String(Date.now()),
        String(eligibleAt)
      );
      if (initialized)
        logger.info(
          `cron[${entry.name}]: enqueued run [id=${id}] [scheduled_at=${new Date(
            scheduledAt
          ).toISOString()}] [eligible_at=${new Date(eligibleAt).toISOString()}]`
        );
      lastEnqueuedAt.set(entry.name, scheduledAt);
    }
  };

  const enqueueTick = async () => {
    if (currentSlot === null) return;
    await enqueueDueFires();
  };

  // leaseDurationMs: crash recovery via stalled reclaim. handlerTimeoutMs: hang → failed-final.
  const executeUnderLease = async (entry: CronEntry, id: string, attempt: number) => {
    try {
      await markRunning(id, attempt);
    } catch (err) {
      logger.error({ err }, `cron[${entry.name}]: failed to mark run as running [id=${id}]`);
      return;
    }

    const startMs = Date.now();
    logger.info(`cron[${entry.name}]: start (attempt ${attempt}/${entry.maxAttempts}) [id=${id}]`);

    try {
      await withTimeout(() => entry.handler(), entry.handlerTimeoutMs ?? handlerTimeoutMs);
      await markCompleted(id);
      logger.info(`cron[${entry.name}]: complete [id=${id}] [duration_ms=${Date.now() - startMs}]`);
    } catch (err) {
      const isHandlerTimeout = err instanceof HandlerTimeoutError;

      const backoffMs = Math.min(retryBackoffBaseMs * 2 ** (attempt - 1), retryBackoffMaxMs);
      const nextAttemptAt = Date.now() + backoffMs;
      const fitsBeforeNextFire = nextAttemptAt + NEXT_FIRE_BUFFER_MS < nextFireMs(entry.pattern);
      const final = isHandlerTimeout || attempt >= entry.maxAttempts || !fitsBeforeNextFire;

      try {
        if (final) await markFailedFinal(id, err);
        else await markPendingRetry(id, err, nextAttemptAt);
      } catch (stateErr) {
        logger.error(
          { err: stateErr, originalErr: err },
          `cron[${entry.name}]: failed to mark run state after attempt ${attempt} [id=${id}]`
        );
      }

      logger.error(
        { err },
        `cron[${entry.name}]: attempt ${attempt} ${
          isHandlerTimeout
            ? "timed out (no retry, wait for next fire)"
            : `failed (${final ? "giving up" : "will retry"})`
        } [id=${id}]`
      );
    }
  };

  const processCandidate = async (id: string) => {
    const data = await redis.hgetall(RUN_KEY(id));
    if (!data?.name) {
      logger.error(
        `cron: pending run expired before it was claimed and will not execute, raise its runHashTtlS [id=${id}]`
      );
      await redis.zrem(PENDING_ZSET, id);
      return;
    }

    const entry = entries.get(data.name);
    if (!entry) return;

    const isPending = data.status === RunStatus.Pending;
    const isStalled = data.status === RunStatus.Running && (await redis.exists(LEASE_KEY(id))) === 0;
    if (!isPending && !isStalled) return;

    // Brief delay so other slot-holders can race for freshly enqueued runs.
    if (isPending) {
      const enqueuedAtMs = Number(data[F.EnqueuedAtMs] ?? 0);
      if (Date.now() - enqueuedAtMs < minProcessAgeMs) return;
    }

    const attempts = Number(data.attempts ?? 0);
    if (attempts >= entry.maxAttempts) {
      await markFailedFinal(id);
      logger.error(`cron[${data.name}]: max attempts reached [id=${id}]`);
      return;
    }

    if (isStalled) {
      logger.info(`cron[${data.name}]: re-claiming stalled run [id=${id}] [previous_worker=${data.worker_id}]`);
    }

    const tracked = redlock.using([LEASE_KEY(id)], entry.leaseDurationMs ?? leaseDurationMs, () =>
      executeUnderLease(entry, id, attempts + 1)
    );
    inFlight.add(tracked);
    try {
      await tracked;
    } catch (err) {
      if (err instanceof ExecutionError || err instanceof ResourceLockedError) return;
      logger.error({ err }, `cron[${data.name}]: unexpected error acquiring lease [id=${id}]`);
    } finally {
      inFlight.delete(tracked);
    }
  };

  const processTick = async () => {
    if (currentSlot === null) return;

    const ids = await redis.zrangebyscore(PENDING_ZSET, "-inf", Date.now(), "LIMIT", 0, PROCESS_BATCH_SIZE);
    shuffleInPlace(ids);

    for (const id of ids) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await processCandidate(id);
      } catch (err) {
        logger.error({ err, id }, "cron: processCandidate failed");
      }
    }
  };

  const safeTick = (label: string, fn: () => Promise<void>) => () => {
    fn().catch((err: unknown) => logger.error({ err }, `cron: ${label} failed`));
  };

  const start = () => {
    stopped = false;
    slotTimer = setInterval(() => void runSlotOp("slot refresh"), slotRefreshMs);
    enqueueTimer = setInterval(safeTick("enqueue tick", enqueueTick), enqueueIntervalMs);
    processTimer = setInterval(safeTick("process tick", processTick), processIntervalMs);
    void runSlotOp("initial slot claim");
  };

  // Drain in-flight handlers before releasing the slot so runs are not left stuck as running.
  const stop = async () => {
    stopped = true;
    if (slotTimer) clearInterval(slotTimer);
    if (enqueueTimer) clearInterval(enqueueTimer);
    if (processTimer) clearInterval(processTimer);

    if (inFlight.size > 0) {
      logger.info(`cron: draining ${inFlight.size} in-flight run(s) [worker=${workerId}]`);
      const drained = Promise.allSettled(Array.from(inFlight));
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<"timeout">((resolve) => {
        timeoutHandle = setTimeout(() => resolve("timeout"), drainTimeoutMs);
      });
      try {
        const result = await Promise.race([drained, timedOut]);
        if (result === "timeout") {
          logger.warn(
            `cron: drain timeout reached after ${drainTimeoutMs}ms with ${inFlight.size} run(s) still active — relying on lease TTL for recovery [worker=${workerId}]`
          );
        }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    }

    await slotOp;

    if (currentSlot !== null) {
      await redis.eval(RELEASE_SLOT_IF_MINE_LUA, 1, SLOT_KEY(currentSlot), workerId);
      logger.info(`cron: released slot ${currentSlot} [worker=${workerId}]`);
      currentSlot = null;
    }
  };

  return { register, start, stop };
};
