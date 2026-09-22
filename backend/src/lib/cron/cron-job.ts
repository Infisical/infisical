import { createHash, randomUUID } from "node:crypto";

import { CronExpressionParser } from "cron-parser";
import { Cluster, Redis } from "ioredis";

import { logger } from "@app/lib/logger";
import { ExecutionError, Redlock, ResourceLockedError } from "@app/lib/red-lock";

// ── cron job name registry ────────────────────────────────────────────────────

export const CronJobName = {
  HealthAlert: "health-alert",
  KmsRootKeyCleanup: "kms-root-key-cleanup",
  DailyReminders: "daily-reminders",
  DailyResourceCleanup: "daily-resource-cleanup",
  DailySecretVersionCleanup: "daily-secret-version-cleanup",
  DailyAuditLogCleanup: "daily-audit-log-cleanup",
  DailyResourceNotification: "daily-resource-notification",
  FrequentResourceCleanup: "frequent-resource-cleanup",
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

// ── tuning constants ──────────────────────────────────────────────────────────

// Jitter is derived from the pattern, never configured per job: how long a job may be held
// back should follow how often it runs. A job's window is this fraction of its own interval,
// capped by `maxJitterMs`. A fraction below 1 is what makes the offset safe by construction,
// so it is not a free parameter:
//   - a run can never reach its own next fire, which `fitsBeforeNextFire` relies on;
//   - the first retry always fits. Worst case is 0.25 x interval + 30s backoff + 1s, under
//     `interval` for any interval above ~41s, and cron cannot fire faster than every 60s.
//     Raising this past ~0.48 would start costing short-interval jobs their retry.
const JITTER_INTERVAL_FRACTION = 0.25;

const PARTICIPANT_SLOTS = 5;
const PROCESS_BATCH_SIZE = 50;
// Safety buffer in `fitsBeforeNextFire`: if the retry's nextAttemptAt is within
// this many ms of the next scheduled fire, treat the run as final and let the
// next fire (separate id) be the natural retry instead.
const NEXT_FIRE_BUFFER_MS = 1_000;
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
  maxJitterMs: 15 * 60_000,
  maxConcurrentHandlers: 4
} as const;

// ── redis schema ──────────────────────────────────────────────────────────────

// Every key this module writes lives under a single Redis Cluster hash tag so
// multi-key Lua scripts never return CROSSSLOT. A custom `keyPrefix` must keep
// that property — see `assertHashTagged`.
const KEY_HASH_TAG = "{cron}";

// Run-hash status values. Stored as plain strings in the hash so we don't
// break Redis tooling, but referenced through this object to avoid drift.
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

// ── lua scripts ───────────────────────────────────────────────────────────────

// Atomic "enqueue this run hash + zset entry if no other pod beat us to it".
// ARGV[2] is the unjittered scheduled fire, recorded on the hash as the run's
// identity. ARGV[6] is the jittered eligibility time, and the zset is scored by
// it so processTick's zrangebyscore holds the run back until its offset elapses.
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

// "DEL only if I still own this slot". Stops a stale stop() call from
// accidentally evicting the new owner after our TTL expired.
const RELEASE_SLOT_IF_MINE_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

// ── types ─────────────────────────────────────────────────────────────────────

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

// A prefix without a `{...}` hash tag would spread this module's keys across
// Cluster slots and break every multi-key EVAL. Fail loudly at construction
// rather than silently at the first enqueue tick.
const assertHashTagged = (keyPrefix: string) => {
  const start = keyPrefix.indexOf("{");
  const end = keyPrefix.indexOf("}", start + 1);
  if (start < 0 || end <= start + 1) {
    throw new Error(`cron: keyPrefix "${keyPrefix}" must contain a non-empty Redis Cluster hash tag, e.g. "{cron}"`);
  }
};

export type TCronJobFactory = ReturnType<typeof cronJobFactory>;

// ── factory ───────────────────────────────────────────────────────────────────

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
  maxConcurrentHandlers = DEFAULTS.maxConcurrentHandlers,
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
   * Ceiling on the derived jitter window. Without it a daily job would be spread over six
   * hours; with it, every job past a ~1h interval shares the same widest window. Set it to 0
   * to disable jitter, which is what development wiring does so a job runs when its pattern
   * says it should.
   */
  maxJitterMs?: number;
  /**
   * Ceiling on how many handlers this pod runs at once. At capacity the pod stops claiming for
   * the tick and leaves the runs in the pending zset, so another pod or a later tick picks them
   * up; nothing is dropped.
   */
  maxConcurrentHandlers?: number;
  /**
   * Namespace for every Redis key this manager owns. Defaults to the production
   * `{cron}` namespace. Tests override it so a test-owned manager and the
   * server's real one can share a Redis without colliding on slot keys.
   */
  keyPrefix?: string;
  /**
   * Whether this pod runs cron handlers at all. When false, `register` is a no-op, so a pod that
   * never starts the timers also never holds the registry. Defaults to true so tests and any
   * caller that only wants the manager keep the previous behaviour.
   */
  schedulingEnabled?: boolean;
}) => {
  assertHashTagged(keyPrefix);
  if (!Number.isFinite(maxJitterMs) || maxJitterMs < 0) {
    throw new Error(`cron: maxJitterMs (${maxJitterMs}) must be a non-negative number`);
  }
  if (!Number.isInteger(maxConcurrentHandlers) || maxConcurrentHandlers < 1) {
    throw new Error(`cron: maxConcurrentHandlers (${maxConcurrentHandlers}) must be an integer >= 1`);
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
  // Tail of the serialized slot-operation chain. Never rejects.
  let slotOp: Promise<void> = Promise.resolve();

  // ── helpers ────────────────────────────────────────────────────────────

  const prevFireMs = (pattern: string) => CronExpressionParser.parse(pattern, { tz: "UTC" }).prev().toDate().getTime();

  const nextFireMs = (pattern: string) => CronExpressionParser.parse(pattern, { tz: "UTC" }).next().toDate().getTime();

  // How far past its scheduled fire a job with this interval may be held back. Proportional
  // to the interval so a frequent job is delayed proportionally less than a rare one, capped
  // so a daily job is not spread across the whole day. NEXT_FIRE_BUFFER_MS is belt-and-braces:
  // JITTER_INTERVAL_FRACTION already keeps the window well inside the interval, but the clamp
  // means the next-fire property survives someone raising the fraction.
  const jitterWindowMs = (intervalMs: number) =>
    Math.min(intervalMs * JITTER_INTERVAL_FRACTION, maxJitterMs, Math.max(0, intervalMs - NEXT_FIRE_BUFFER_MS));

  // The window for a pattern, sampled at registration. A pattern with uneven intervals (say
  // quarterly) gets its window recomputed per fire at enqueue; this sample only has to be good
  // enough for the run-hash TTL check.
  const jitterWindowForPattern = (pattern: string) => {
    const it = CronExpressionParser.parse(pattern, { tz: "UTC" });
    const next = it.next().toDate().getTime();
    return jitterWindowMs(it.next().toDate().getTime() - next);
  };

  // Per-job offset into the jitter window, derived from a stable hash of the job
  // name. It MUST NOT be random: the run id is keyed on the scheduled fire time
  // and every pod computes a run's eligibility time independently, so a per-pod offset
  // would make pods disagree on run identity and break the enqueue dedup and the
  // lease logic. Hashing also spreads the jobs permanently, where random offsets
  // would re-collide on the next fire.
  const jitterOffsetMs = (name: string, windowMs: number) => {
    if (windowMs <= 0) return 0;
    // Six bytes keeps the value inside Number.MAX_SAFE_INTEGER.
    return createHash("sha256").update(name).digest().readUIntBE(0, 6) % windowMs;
  };

  // The earliest a fire may be picked up: its scheduled time plus the job's
  // offset. Distinct from the run hash's `started_at`, which is when a handler
  // actually began. The window is clamped so an offset can never push a run to
  // or past its own next fire: the two would then become eligible in the wrong
  // order, and `fitsBeforeNextFire`, which measures a retry against the raw next
  // fire, would stop bounding the retry correctly. NEXT_FIRE_BUFFER_MS is the
  // same margin that check uses.
  const eligibleAtMs = (entry: CronEntry, scheduledAt: number, nextFire: number) => {
    const windowMs = jitterWindowMs(nextFire - scheduledAt);
    return scheduledAt + jitterOffsetMs(entry.name, windowMs);
  };

  const atHandlerCapacity = () => inFlight.size >= maxConcurrentHandlers;

  const shuffleInPlace = <T>(arr: T[]): void => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      // eslint-disable-next-line no-param-reassign
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  // Races `task` against a timeout. If the timeout wins, throws a
  // HandlerTimeoutError so executeUnderLease's catch can mark the run
  // failed-final (rather than pending-retry) and prevent another pod from
  // running the handler concurrently with the still-executing zombie.
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
      taskPromise.catch(() => {});
    }
  };

  // ── run-hash status writes ──────────────────────────────────────────────────

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

  // `err` is optional: the max-attempts-reached path writes a "failed" status
  // without a last_error.
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
    // zset score = next_attempt_at so processTick's zrangebyscore filter skips
    // this run until its backoff window elapses.
    await redis.zadd(PENDING_ZSET, nextAttemptAt, id);
  };

  // ── registration ────────────────────────────────────────────────────────────

  // Registers a cron entry with this pod. `runHashTtlS` controls how long each
  // run's hash lives in Redis after enqueue.
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

    // The run hash has to outlive the offset, or it expires before its own pickup and
    // processCandidate reaps the orphaned zset entry with no log and no failed status: the
    // job would silently never run. Measured against this pattern's own window.
    const windowMs = jitterWindowForPattern(pattern);
    if (runHashTtlS * 1000 <= windowMs) {
      throw new Error(
        `cron[${name}] runHashTtlS (${runHashTtlS}s) must exceed its jitter window (${Math.round(
          windowMs / 1000
        )}s), otherwise the run hash expires before the run is picked up`
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
    logger.info(`cron[${name}]: registered (pattern="${pattern}") [jitter_window_ms=${windowMs}]`);
  };

  // ── slot election ───────────────────────────────────────────────────────────

  // Caps the number of pods that participate in cron ticking. Each pod holds
  // one of N slots via SET NX/XX with a short TTL: refreshes its own slot if
  // it still owns one, otherwise tries to claim a free slot.
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

  // Runs slot claims/refreshes strictly one at a time.
  //
  // `claimOrRefreshSlot` awaits between reading `currentSlot` and writing it,
  // so two overlapping ticks could both observe a lost slot, both null
  // `currentSlot`, and then claim two *different* slots — the pod would burn
  // two of the five participant slots and leak one on shutdown, since only the
  // last-assigned `currentSlot` is ever released.
  //
  // Chaining also gives stop() one handle to await, so it can never read
  // `currentSlot` mid-handover (skipping the release) or have a late claim land
  // after the release.
  const runSlotOp = (label: string) => {
    slotOp = slotOp
      .then(() => (stopped ? undefined : claimOrRefreshSlot()))
      .catch((err: unknown) => logger.error({ err }, `cron: ${label} failed`));
    return slotOp;
  };

  // ── enqueue ─────────────────────────────────────────────────────────────────

  // For each registered entry, computes the most recent scheduled fire time
  // and atomically inserts a run hash + pending-zset entry if not already
  // present. The Lua script makes the existence check + write a single op so
  // multiple pods racing to enqueue the same fire produce exactly one run.
  //
  // The run id and the hash's `scheduled_at` stay keyed on the unjittered fire,
  // so run identity is exactly what it was before jitter existed. Only the zset
  // score carries the offset, which is what holds the run back from processTick.
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

  // Slow timer (~30s) that only creates run hashes for due fires. Split from
  // processing so the pod that enqueues doesn't immediately consume everything
  // it just created — leaves time for other slot-holders' process ticks to race.
  const enqueueTick = async () => {
    if (currentSlot === null) return;
    await enqueueDueFires();
  };

  // ── process ─────────────────────────────────────────────────────────────────

  // Executes one attempt of `entry` under an already-acquired redlock. Writes
  // the running state, races the handler against handlerTimeoutMs, and
  // branches into success / retry / final failure on completion.
  //
  // Two-knob recovery model:
  //   leaseDurationMs  → governs CRASH recovery. When the holder pod dies,
  //                      its lease key TTLs out and other pods see the run as
  //                      stalled via the isStalled path in processCandidate.
  //   handlerTimeoutMs → bounds the LEASE for HANG recovery. On timeout we release the lease and
  //                      mark the run failed-final — a retry would race with the still-running zombie handler. The next scheduled fire is the natural retry.
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

      // Exponential backoff: 1×, 2×, 4× ... capped at retryBackoffMaxMs.
      const backoffMs = Math.min(retryBackoffBaseMs * 2 ** (attempt - 1), retryBackoffMaxMs);
      const nextAttemptAt = Date.now() + backoffMs;
      // If the retry wouldn't fit before the next scheduled fire, treat this
      // run as final — the upcoming fire (separate id) is the natural retry.
      // Avoids overlapping attempts of the same cron and avoids squashing
      // backoff to ~0 near the end of an interval.
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

  // Inspects one pending zset id: validates the run hash, applies the
  // min-age and max-attempts gates, and races for the lease. Anything that
  // can be decided without taking a lock is decided here so we only ever
  // hand a "ready, attempt-eligible" run to executeUnderLease.
  const processCandidate = async (id: string) => {
    const data = await redis.hgetall(RUN_KEY(id));
    if (!data?.name) {
      // Hash expired (TTL) but zset entry lingered; clean up.
      await redis.zrem(PENDING_ZSET, id);
      return;
    }

    const entry = entries.get(data.name);
    if (!entry) return; // not handled on this pod

    const isPending = data.status === RunStatus.Pending;
    const isStalled = data.status === RunStatus.Running && (await redis.exists(LEASE_KEY(id))) === 0;
    if (!isPending && !isStalled) return;

    // Min-age delay on first pickup so the pod that enqueued doesn't
    // immediately grab everything before other slot-holders' process ticks
    // fire. Stalled runs bypass this — they're already past first pickup.
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

    if (atHandlerCapacity()) return;

    // Track the in-flight run so stop() can wait for it to settle before
    // tearing down. Lock-contention rejections settle within a tick, so they
    // don't measurably delay shutdown drain.
    const tracked = redlock.using([LEASE_KEY(id)], entry.leaseDurationMs ?? leaseDurationMs, () =>
      executeUnderLease(entry, id, attempts + 1)
    );
    inFlight.add(tracked);
    try {
      await tracked;
    } catch (err) {
      // ExecutionError / ResourceLockedError mean another pod owns the lease — expected contention, swallow.
      if (err instanceof ExecutionError || err instanceof ResourceLockedError) return;
      logger.error({ err }, `cron[${data.name}]: unexpected error acquiring lease [id=${id}]`);
    } finally {
      inFlight.delete(tracked);
    }
  };

  // Fast timer (~5s) that scans the pending zset and races for runs to
  // execute. Ids are shuffled per tick so different slot-holders try
  // different ids first, spreading lease contention and distributing handler
  // load across pods.
  const processTick = async () => {
    if (currentSlot === null) return;

    // Filter by zset score so backed-off retries (score = next_attempt_at)
    // are skipped until their backoff window elapses.
    const ids = await redis.zrangebyscore(PENDING_ZSET, "-inf", Date.now(), "LIMIT", 0, PROCESS_BATCH_SIZE);
    shuffleInPlace(ids);

    for (let i = 0; i < ids.length; i += 1) {
      if (atHandlerCapacity()) {
        logger.info(
          `cron: at handler capacity (${maxConcurrentHandlers}), deferring ${
            ids.length - i
          } due run(s) [worker=${workerId}]`
        );
        break;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        await processCandidate(ids[i]);
      } catch (err) {
        logger.error({ err, id: ids[i] }, "cron: processCandidate failed");
      }
    }
  };

  // ── lifecycle ───────────────────────────────────────────────────────────────

  const safeTick = (label: string, fn: () => Promise<void>) => () => {
    fn().catch((err: unknown) => logger.error({ err }, `cron: ${label} failed`));
  };

  // Starts the slot-refresh, enqueue, and process timers, and claims a slot
  // immediately so the pod doesn't wait a full `slotRefreshMs` before
  // participating.
  const start = () => {
    stopped = false;
    slotTimer = setInterval(() => void runSlotOp("slot refresh"), slotRefreshMs);
    enqueueTimer = setInterval(safeTick("enqueue tick", enqueueTick), enqueueIntervalMs);
    processTimer = setInterval(safeTick("process tick", processTick), processIntervalMs);
    void runSlotOp("initial slot claim");
  };

  // Stops the timers, drains in-flight handlers, and atomically releases the
  // held slot (only if we still own it) so another pod can take over without
  // waiting for the slot TTL.
  //
  // Drain semantics wait for the currently active runs to finish so destructive handlers (rotations, deletions)
  // aren't aborted mid-execution and graceful redeploys don't leave runs
  // stuck in `status='running'` until the lease TTL elapses.
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

    // No new slot ops can be queued (timers cleared, `stopped` set), so this is
    // the final tail. Waiting on it guarantees `currentSlot` is settled and that
    // nothing can re-create the key after the release below.
    await slotOp;

    if (currentSlot !== null) {
      await redis.eval(RELEASE_SLOT_IF_MINE_LUA, 1, SLOT_KEY(currentSlot), workerId);
      logger.info(`cron: released slot ${currentSlot} [worker=${workerId}]`);
      currentSlot = null;
    }
  };

  return { register, start, stop };
};
