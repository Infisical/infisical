# Scheduled Jobs (Cron Manager)

Recurring work runs through the cron manager in `src/lib/cron/cron-job.ts` (`cronJobFactory`). A single instance is constructed in `src/server/routes/index.ts` (~line 541) and injected as `cronJob` into any service that needs to schedule periodic work. The factory exposes `register`, `start`, and `stop`; `start` is called once after construction, and `stop` is invoked during graceful shutdown to drain in-flight handlers.

**Only `general-workers` pods start the manager's timers**, so only they execute a scheduled handler; every pod still calls `register`. The separate `cronJobs` array in `src/server/routes/index.ts` is deliberately **not** gated: those refresh the process's own caches (license, rate limits, env overrides), not fleet work.

**Per-process refreshes use `startLocalRefresh` (`src/lib/cron/local-refresh.ts`), never the cron manager and never a raw `new CronJob`.** The cron manager runs a job once per fleet, which would leave every other pod's in-memory state stale; a wall-clock cron pattern makes every pod fire in the same second. The helper starts each process at a random offset within one interval (random per process on purpose, unlike the manager's deterministic hash), skips a tick while the previous run is in flight, logs and swallows errors, and unrefs its timers. Its `stop()` handle is what goes in `cronJobs`. It records `infisical.local_refresh.*` on the `InfisicalCore` meter, labelled by `name` as `job.name`, so a new refresh needs no metric code; keep `name` a fixed string. A failing refresh keeps retrying on every tick rather than giving up after N failures, because stopping would freeze the pod's state at whatever it last loaded. The `consecutive_failures` gauge (reset on success) is the alerting signal.

**Why this exists instead of BullMQ repeatables**: cron runs are coordinated across pods via a slot-election scheme (5 participant slots backed by Redis SET NX/PX) plus per-run redlocks, so each fire executes exactly once across the fleet without the orphaned-scheduler / duplicate-execution failure modes the BullMQ `JobScheduler` had. The manager also handles crash recovery via lease TTLs, hang recovery via per-handler timeouts, and bounded exponential backoff that won't overlap with the next scheduled fire.

**Registering a cron job**:

1. Add a new entry to the `CronJobName` registry at the top of `src/lib/cron/cron-job.ts`. All cron names must be defined there — don't pass raw strings.
2. In the owning service/queue file, take `cronJob: TCronJobFactory` as a dependency and call `cronJob.register(...)` from an `init()` (or `start*()`) method:

   ```ts
   import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";

   export const myServiceFactory = ({ cronJob }: { cronJob: TCronJobFactory }) => {
     const init = () => {
       cronJob.register({
         name: CronJobName.MyJob,
         pattern: "*/5 * * * *",      // standard cron, UTC
         runHashTtlS: 60 * 60,        // how long the run hash lives in Redis
         enabled: !appCfg.isSecondaryInstance, // gate per-deploy if needed
         maxAttempts: 3,              // optional, default 3
         handler: async () => { /* work */ }
       });
     };
     return { init };
   };
   ```

3. Add a corresponding alarm in the infrastructure repo so the new job is monitored. Follow the existing pattern in `infisical-shared-cloud/modules/redis_alarms/main.tf` — every cron job must have an alarm defined there. Don't ship a new cron job without wiring up its alarm.

**Handler contract**:
- Each scheduled fire runs exactly once across the fleet: pods race for a per-run redlock, the winner executes the handler, and the others no-op. You don't need in-handler locking to guard against concurrent pods.
- Handlers must be idempotent at the boundary of `handlerTimeoutMs` (default 5 min). A timeout marks the run failed-final and waits for the next fire — it does NOT retry the same fire, because the timed-out handler may still be running.
- Failures (non-timeout) retry with exponential backoff (base 30 s, max 5 min) up to `maxAttempts`, but only if the retry would still fit before the next scheduled fire. Otherwise the next fire is treated as the natural retry.
- Long-running handlers should override `handlerTimeoutMs` / `leaseDurationMs` per-entry (must satisfy `handlerTimeoutMs <= leaseDurationMs`).
- **A fire is not picked up at its scheduled time; it is picked up at a deterministic offset past it.** Cron patterns cluster hard, so without a spread one pod claims a dozen handlers in a single tick. Two knobs bound that, both in `cronJobFactory`:
  - **Jitter** spreads pickup, and is *derived, never configured*: a job's window is `JITTER_INTERVAL_FRACTION` (0.25) of its own cron interval, capped by the factory's `maxJitterMs` (5 min), so a `*/5` job gets 75s and anything at or past a 20-minute interval gets the full 5 min. Two things follow from the fraction being below 1: a run can never reach its own next fire, and the first retry always fits (worst case `0.25 x interval + 30s backoff + 1s`, under `interval` for anything above ~41s, and cron cannot fire faster than every 60s). The offset within the window is `sha256(name) % window`, never random: every pod computes a run's eligibility independently and the run id is keyed on the *unjittered* fire, so a per-pod offset would break the Redis enqueue dedup and the lease logic. Only the pending-zset score carries the offset; the run id and `scheduled_at` are unchanged. Development wiring passes `maxJitterMs: 0` so a job runs when its pattern says. `register` rejects anything but a 5-field pattern: the retry model assumes minute granularity, and a 6-field pattern firing every 30s would have its first retry land past its own next fire. Sub-minute recurring work belongs on a `setInterval` or a queue, as the event outbox relay does.

**When to use cron vs. queue**:
- Scheduled/recurring (every N minutes, daily at X, cron pattern) → `cronJob.register(...)`.
- One-shot or event-triggered work (enqueued from a request handler or another job) → BullMQ queue + worker.
- A cron handler that fans out per-tenant work typically *enqueues BullMQ jobs* for each unit of work rather than doing the work inline — keep the cron tick fast and let the queue worker handle parallelism and retries for the actual payload.

See `src/services/health-alert/health-alert-queue.ts` for a minimal example, `src/services/resource-cleanup/resource-cleanup-queue.ts` for a service with multiple registrations, and `src/ee/services/secret-rotation-v2/secret-rotation-v2-queue.ts` for a cron-tick that fans out into a BullMQ queue.
