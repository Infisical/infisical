# Event outbox: delivery internals

How to define and emit an event is in `backend/AGENTS.md` ("How to implement an event"). This file is for
writing a consumer or changing the outbox itself.

## Consumer contract

- **The row owns retry state** (`attempts`, `nextRetryAt`, backoff, terminal `failed`); the consumer owns
  what "delivered" means and returns `Delivered` / `Retry` / `Failed` per event. Record what a retry should
  skip in the consumer's own delivery records keyed by `TEvent.id` (stable across attempts), as the alert
  consumer does in `alert_history.eventId`.
- **`TEvent.isFinalAttempt`** marks the last try: the row is `failed` afterwards whatever you return, so a
  consumer with its own state records the terminal outcome then. Stale-claim give-ups never reach a consumer.
- **Never let one event's failure escape `handle`**, or the whole batch retries. Catch per event and report
  `Retry` for that event alone. Use `runEventsSerially` and
  `parseEventPayload` (`event-outbox-fns.ts`); a consumer calling a third party per event uses
  `runEventsConcurrentlyByKey` so one slow tenant cannot hold up the batch.
- **Delivery is at-least-once and ordering is best-effort.** A row in its backoff window can be overtaken.
  Don't promise strict ordering or add a partition key until a consumer needs one.
- **Tenant and resource live in `payload`**, validated by the consumer's `dataSchema`. Don't add columns
  for them to the outbox; nothing queries on them.
- Discovery only sees consumers registered in this process; rows for other names wait and show on the
  oldest-pending gauge.

## Mechanism

- Backoff is exponential with jitter from 30s; `MAX_OUTBOX_ATTEMPTS` puts the last attempt about an hour
  after the first. Manual replay: `status = 'retry', attempts = 0, nextRetryAt = now()`.
- **Claims are fenced leases.** `drain` refreshes `lockedAt` while `handle` runs; the sweeper recycles
  claims older than `STALE_CLAIM_THRESHOLD_MS`. `claimBatch` stamps a `lockToken` that `extendClaims` and
  `commitResults` require, so a recycled worker's late result cannot clobber the new owner. A short settle
  count in `drain`'s log is the only sign a batch went out twice.
- **BullMQ owns latency, not correctness**: `attempts: 1` on the flush job is intentional.
- **The relay is a `setInterval`, not a cron job**, because it needs a sub-minute cadence and
  `FOR UPDATE SKIP LOCKED` plus the flush `jobId` already make concurrent pollers safe.
- One flush per consumer at a time (the `jobId` is the consumer name), in bounded batches
  (`MAX_BATCHES_PER_FLUSH` x `OUTBOX_CLAIM_BATCH_SIZE`).

**Watch `infisical.event_outbox.oldest_pending_age`**: it catches a dead relay, a wedged consumer and a
stuck claim. `lag` and `exhausted.count` are labelled by consumer automatically.

The DAL is covered by `e2e-test/event-outbox.spec.ts` against real Postgres; unit tests only check query
shape.
