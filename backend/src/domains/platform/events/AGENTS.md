# Events domain

The transactional outbox: an event is written as a row in the write's own transaction, then delivered to each
subscribing consumer at least once. How to define and emit an event is in `backend/AGENTS.md` ("How to implement
an event"). This file is for writing a consumer or changing the domain itself.

Two services, split by who calls them:

- `eventEmitterService: TEventEmitterService` is what every emitter takes.
  - `emit(events)` writes the events on their own.
  - `within(tx).emit(events)` joins the caller's transaction, so the events commit or roll back with it. It is the
    only thing that can run on a caller's transaction (see "Events joins transactions" in `src/domains/AGENTS.md`).
- `eventDeliveryService: TEventDeliveryService` is what the module's worker, crons and timer call: `drain(consumer)`
  delivers a consumer's due events now (e2e specs call it too), `relayDueEvents()` queues a flush per consumer with
  due events, `sweepStaleClaims()` and `pruneTerminalRows()`. Nothing that emits takes it.

`EventsModule.registerConsumer(consumer)` adds a consumer while the server is being wired.

Owns the `event_outbox` table (`OutboxEntryStore`). Depends on no other domain.

| Layer | Holds |
| --- | --- |
| `ce/models/` | `EventDefinition` (an event's name and data schema), `EmittedEvent` (a validated event about to be written), `OutboxEntry` (one consumer's delivery of one event: status, attempts, backoff), `OutboxClaim` (the entries one worker holds, and the token that fences them), `EventRejectedError` (why an emit was refused) |
| `ce/data-access/` | `OutboxEntryStore` |
| `ce/clients/otel-metrics/` | `OtelMetricsClient`: the outbox metrics and the oldest-pending gauge, behind `TEventsMetrics` so services never import the meter |
| `ce/services/event-emitter/` | `EventEmitterService` |
| `ce/services/event-delivery/` | `EventDeliveryService` |
| `ce/services/helpers/` | `ConsumerRegistry`, `buildDeliveries` (validation and who gets a row), `FlushQueue`, `RelayTimer`, and the helpers consumers use (`consume-events.ts`) |
| `ce/testing/` | `InMemoryOutboxEntryStore`, the store contract suite, `buildEvents()` (the real services on in-memory stores), `FakeEventEmitterService`, `FakeEventsMetrics` |

## Declared exceptions

- **Consumers register after the module is built, and most are legacy code.** A consumer depends on services
  that themselves emit, so it cannot arrive through the constructor the way License takes `usageCounters`.
  `routes/index.ts` calls `domains.events.registerConsumer(...)` while wiring and `domains.events.start()` once
  every consumer is in; `start()` seals the registry, so a late registration throws instead of silently missing
  the events emitted before it. `TEventConsumer` is this domain's type, which the consumer implements.
- **Legacy code emits through `legacyEventEmitter`** (`src/lib/knex/event-emitter.ts`), which turns its
  `tx?: Knex` into `within(sealKnexTransaction(tx))`, or a plain `emit` when the handle is not a transaction. Do
  not add a `Knex` parameter to `TEventEmitterService`.

## Consumer contract

- **The entry owns retry state** (`attempts`, `nextRetryAt`, backoff, terminal `failed`); the consumer owns
  what "delivered" means and returns `Delivered` / `Retry` / `Failed` per event. Record what a retry should
  skip in the consumer's own delivery records keyed by `TEvent.id` (stable across attempts), as the alert
  consumer does in `alert_history.eventId`.
- **`TEvent.isFinalAttempt`** marks the last try: the entry is `failed` afterwards whatever you return, so a
  consumer with its own state records the terminal outcome then. Stale-claim give-ups never reach a consumer.
- **Never let one event's failure escape `handle`**, or the whole batch retries. Catch per event and report
  `Retry` for that event alone. Use `runEventsSerially` and `parseEventPayload`; a consumer calling a third
  party per event uses `runEventsConcurrentlyByKey` so one slow tenant cannot hold up the batch.
- **Delivery is at-least-once and ordering is best-effort.** An entry in its backoff window can be overtaken.
  Don't promise strict ordering or add a partition key until a consumer needs one.
- **Tenant and resource live in the event's `data`**, validated by the consumer's `dataSchema`. Don't add
  columns for them to the outbox; nothing queries on them.
- **`name` is stored on every row and is part of the flush job id**, so renaming a consumer orphans its
  in-flight rows.
- Discovery only sees consumers registered in this process; rows for other names wait and show on the
  oldest-pending gauge.
- To test a consumer through real retries, build the services with `buildEvents({ consumers: [consumer] })`, emit
  through `eventEmitterService` and call `eventDeliveryService.drain`; `outboxEntryStore.elapseBackoff()` makes waiting entries due.

## Mechanism

- **Rules about an entry live on `OutboxEntry`**: `settle(result)` and `expireClaim()` decide delivered, retry
  or failed and count the attempt, `drawRetryDelayMs()` is the backoff, and `isFinalAttempt()` is what the
  consumer is told. `OutboxClaim.settle(results)` matches a consumer's results to its entries by event id. The
  store only persists what the entry says, one `UPDATE` per distinct outcome, drawing one delay per `UPDATE`.
- Backoff is exponential with jitter from 30s; `MAX_OUTBOX_ATTEMPTS` puts the last attempt about an hour
  after the first. Manual replay: `status = 'retry', attempts = 0, nextRetryAt = now()`.
- **Claims are fenced leases.** `drain` refreshes `lockedAt` while `handle` runs; the sweeper recycles
  claims older than `STALE_CLAIM_THRESHOLD_MS`. `claimBatch` stamps a `lockToken` on the `OutboxClaim` that
  `extendClaim` and `saveSettled` require, so a recycled worker's late result cannot overwrite the new owner's. A short settle
  count in `drain`'s log is the only sign a batch went out twice.
- **`claimBatch` is one statement outside a transaction**, so its row locks live only as long as the `UPDATE`.
  `saveSettled`, and `lockStaleClaims` with `saveExpired`, run inside `transactionRunner.run`.
- **BullMQ owns latency, not correctness**: `attempts: 1` on the flush job is intentional.
- **The relay is a `setInterval` (`RelayTimer`), not a cron job**, because it needs a sub-minute cadence and
  `FOR UPDATE SKIP LOCKED` plus the flush `jobId` already make concurrent pollers safe.
- One flush per consumer at a time (the `jobId` is the consumer name), in bounded batches
  (`MAX_BATCHES_PER_FLUSH` x `OUTBOX_CLAIM_BATCH_SIZE`).
- **Queue, job and cron names are frozen** (`EventsQueues`, the two `event-outbox-*` crons): old pods share
  them, and the rows, during a rolling deploy.
- **A malformed event throws at emit**, before any database access, and fails the caller's write on purpose.
  It is a bug at the emit site, so the user gets a 500 naming the request ID and the detail goes to the log and
  the rejected counter.

**Watch `infisical.event_outbox.oldest_pending_age`**: it catches a dead relay, a wedged consumer and a
stuck claim. `lag` and `exhausted.count` are labelled by consumer automatically.

## Testing

`OutboxEntryStore` and `InMemoryOutboxEntryStore` pass the same contract suite
(`testing/outbox-entry-store-contract.ts`); add a case there for any new query. What only Postgres proves
(joining a transaction, rollback, the `eventId` default) is in the `*.integration-test.ts` files. In e2e
specs the module is wrapped by `e2e-test/fakes/events-module.ts`, which records the secret events and lets a
spec deliver on demand.
