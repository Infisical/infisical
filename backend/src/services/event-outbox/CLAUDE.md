# Event Outbox (transactional and generic; alerting is its first consumer)

`src/services/event-outbox/` writes "this happened" as a row inside the caller's own transaction, so
an event is exactly as durable as the business write. Enqueueing to Redis after commit loses the event
whenever the pod dies or Redis is down in that window. It's not alert-specific:
`alert-event-consumer.ts` is one consumer on the shared registry, and anything else that needs
at-least-once delivery of a domain event registers next to it.

**Naming:** the outbox is an implementation detail to both sides of it. Emitters depend on
`TEventEmitter` and pass a `TEventInput`; consumers implement `IEventConsumer`, receive `TEvent[]`
(the row minus its lock, attempt, and status columns) and return `TEventConsumerResult` with an
`EventResultStatus`. Names with "outbox" in them (the DAL, queue, cron jobs, metrics,
`EventOutboxStatus`, `TOutboxFlushKey`) describe the mechanism and stay inside the module and its
wiring. A dependency field for the emitter is `eventEmitter`, not `eventOutboxService`.

**Emitting:** `eventEmitter.emit(event, tx)`. Pass the transaction of the write the event describes, so the event is exactly as durable as that write. Omit `tx` only when there is no such write left to be atomic with (for example after it already committed); the insert then runs on its own.

```ts
await someDAL.transaction(async (tx) => {
  const request = await approvalRequestDAL.create({ ... }, tx);
  await eventEmitter.emit(
    {
      eventType: "approval.workflow.request_opened",
      payload: { orgId, projectId, resourceType: "approval.workflow", resourceId: policyId, targetIds: [request.id] }
    },
    tx
  );
});
```

- Only `subscribesTo(eventType)` runs before the insert, in memory. Whether a customer configured
  anything for this resource is decided in the worker; a row nobody wanted is marked `Delivered` and
  pruned within a day. If that ever matters for a hot event type, cache inside the consumer rather than
  adding a read to the emit path.
- Nothing is caught. A swallowed insert failure hands the caller a poisoned transaction (`25P02` on its
  next statement), and a payload that fails the consumer's `payloadSchema` is a bug at the emit site.
  Both checks run before any DB access.

**How delivery works:**

- **The row owns retry state** (`attempts`, `nextRetryAt`, backoff, terminal `failed`); the consumer
  owns what "delivered" means and reports `Delivered` / `Retry` / `Failed` per event. The outbox keeps
  no per-event state for a consumer: what a retry should skip is recorded wherever the consumer already
  keeps delivery records, keyed by `TEvent.id` (stable across attempts). The alert consumer files each
  run under that id in `alert_history.eventId` and the engine skips channels already recorded there.
  Backoff is exponential with jitter from 30s, and `MAX_OUTBOX_ATTEMPTS` puts the last attempt about an
  hour after the first, because a `failed` row is a notification nobody will receive. To replay failed
  rows by hand: `status = 'retry', attempts = 0, nextRetryAt = now()`.
- **A claim is a lease, and the lease is fenced.** The sweeper hands back any `processing` row whose
  `lockedAt` is older than `STALE_CLAIM_THRESHOLD_MS`, with the same backoff as a normal failure, and counts
  exhausted rows on the same metric. `drain` refreshes `lockedAt` while `handle` runs so a slow batch isn't
  delivered twice. Because `handle` has no time bound (unlike the audit log stream outbox, where every
  provider call has an HTTP timeout and a claim therefore can't outlive the threshold), that heartbeat can
  fail while the work carries on, so a claim can be recycled under a worker that is still alive. `claimBatch`
  stamps a `lockToken` and `extendClaims` / `commitResults` both require it, so the recycled worker's late
  result can't clear the new owner's lock or drop its outcome. `commitResults` returns how many rows it
  settled and `drain` logs a short settle: that count is the only signal that a batch went out twice, since
  the fence protects the bookkeeping but delivery stays at-least-once.
- **The envelope carries only what the outbox queries on.** `consumer`, `eventType`, and the retry and
  lock columns. Which tenant and resource an event concerns lives in `payload` under a shape the
  consumer's `payloadSchema` declares, and that schema is where it is validated (the alert consumer
  requires `orgId` as a UUID). The outbox never groups, filters or indexes on any of it, so don't add a
  tenant or resource column back for a query nothing runs.
- **Discovery only looks at consumers registered in this process.** A row for any other name has nowhere
  to go here. It waits and shows up on the oldest-pending gauge instead.
- **Don't let one event's failure escape `handle`.** The outbox retries the whole batch when `handle`
  throws. Catch per event and report `Retry` for that event alone (see `alert-event-consumer.ts`).
- **BullMQ owns latency, not correctness.** `attempts: 1` on the flush job is intentional; retry lives
  on the row. A lost job costs one relay interval.
- **The relay is a `setInterval`, not a cron job.** It doesn't need exactly-once (`FOR UPDATE SKIP
  LOCKED` plus the flush `jobId` make concurrent pollers safe) and it needs a sub-minute cadence the
  cron manager can't give.
- **Delivery is serial per consumer, and ordering is best-effort.** The flush `jobId` is the consumer
  name, so one flush per consumer runs at a time and `drain` works through its backlog in bounded batches
  (`MAX_BATCHES_PER_FLUSH` x `OUTBOX_CLAIM_BATCH_SIZE` per flush; the next relay tick picks up the rest).
  `claimBatch` sorts by `id` (re-sorting what `RETURNING` gives back, which is arbitrary). A row inside
  its backoff window is skipped, so a later row can overtake it. That's deliberate: blocking a consumer
  behind its oldest failing row is the wrong trade for notifications. Don't promise strict ordering, and
  don't add a partition key back until a consumer needs one: no consumer today depends on the order two
  events for one resource arrive in, and each event is idempotent on its own through alert history.
- **Delivery is at-least-once.** `commitResults` is retried in-process, since by then the consumer has
  already sent; what's left is narrowed by the consumer's own delivery records and by the emitter's
  `idempotencyKey`.

**Watch `infisical.event_outbox.oldest_pending_age`.** It catches a dead relay, a wedged consumer and a
stuck claim alike. `lag` and `exhausted.count` are recorded by the outbox, labelled by consumer, so a
new consumer gets them for free.

**Adding an event-triggered alert** needs no outbox code: declare the event with
`triggerType: AlertTriggerType.Event`, implement `findEventTargets`, and emit with
`payload: { orgId, projectId, resourceType, resourceId, targetIds, ...facts }` where `resourceType` is the
provider's. A
`resourceType` that doesn't declare the `eventType` fails the row terminally with both named, so a bad
emit site shows up in the logs on its first event.

**The event contract belongs to the domain that emits it, not to a consumer.** The identity auth method
event (key, resource type, change enum, payload schema, and the `emitIdentityAuthMethodChanged` helper)
lives in `src/services/identity/identity-auth-method-events.ts`. The 13 auth method services import the
helper from there and the alert provider imports the schema from there, so neither depends on the other
and a second consumer of the same event has one place to import from. When several services fire the same
event, give it one such helper rather than repeating the `emit` literal: the helper owns the payload shape,
and the provider's test parses what the helper emits with the delivery schema. A bare `updateById` had to
become a short transaction for this; the cache invalidation that follows it stays outside, after commit.

The DAL is covered by `e2e-test/event-outbox.spec.ts` against real Postgres; the unit tests only check
query shape.
