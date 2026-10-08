# Queue System (BullMQ)

Queue infrastructure in `src/queue/queue-service.ts`. Defines 30+ named queues via `QueueName` enum (e.g., `SecretRotation`, `AuditLog`, `IntegrationSync`, `SecretReplication`, `SecretSync`, `DynamicSecretRevocation`). Each queue has typed payloads defined in `TQueueJobTypes`.

Queue jobs support: delays, attempts with exponential/fixed backoff, and completion/failure cleanup. **Use BullMQ only for event-driven, payload-carrying work** — jobs enqueued in response to a request or another job (audit log writes, integration syncs, secret replication, webhook fan-out, etc.).

**Do NOT use BullMQ repeatable jobs or `JobScheduler` for recurring/cron-pattern work.** All scheduled/periodic tasks must use the cron manager (see `src/lib/cron/CLAUDE.md`). The previous BullMQ-repeatable pattern has been migrated off, and `queueServiceFactory` actively cleans up stale repeatable queues and schedulers on boot (`src/queue/queue-service.ts:585-650`) — re-introducing a BullMQ repeatable will collide with that cleanup and cause double execution.

Queue handler factories (e.g., `src/services/secret/secret-queue.ts`) follow the same DI pattern as services — they receive DALs and services as dependencies.

`queueService.start(name, handler, opts)` accepts `concurrency` (per-worker parallelism ceiling) and BullMQ's `limiter: { max, duration }` (fleet-wide throughput cap, coordinated via Redis). Use both to **rate-shape DB-heavy background work** so a large backlog drains as an even plateau instead of a burst — see `src/services/project/project-cleanup-queue.ts`. The cron cadence must not be the pacer; load is bounded by `concurrency × per-job cost`, and the limiter caps steady throughput.

**`INFISICAL_RUN_MODES` gates the consumer, never the producer.** `start()` creates the BullMQ `Queue` for every queue in every run mode, and only skips creating the `Worker` when the queue isn't consumed by this pod: `secret-scanning` covers `SECRET_SCANNING_QUEUES`, `general-workers` covers everything else. This invariant is what makes splitting the fleet safe — an API-only pod runs no workers at all but must still be able to enqueue, since `queue()` silently no-ops on an uninitialized queue (`await q?.add(...)`) and would otherwise drop every job destined for another pod's worker. It also means `upsertJobScheduler` works from any pod, so boot-time scheduling needs no run-mode branch.

`QUEUE_WORKERS_ENABLED` and `QUEUE_WORKER_PROFILE` were replaced by `INFISICAL_RUN_MODES` and no longer exist.

**Worker heartbeats detect a fleet nobody deployed**, since an ungated producer means an `api`-only deployment silently queues work nothing consumes. In `src/lib/worker-heartbeat/worker-heartbeat.ts`: a `general-workers` pod `startReporting`s itself into a per-worker-type sorted set scored by its heartbeat deadline (60s beat, 5-minute TTL), and an `api` pod that doesn't run the fleet `startMonitoring`s it, logging an error while no instance reports. Observation only — never wire it into `/api/status`; a deployment missing its workers must still serve API traffic.
