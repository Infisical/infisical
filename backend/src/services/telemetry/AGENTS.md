# PostHog aggregated events

Events in `POSTHOG_AGGREGATED_EVENTS` are buffered in Redis and rolled up by the `TelemetryAggregatedEvents`
cron every 10 minutes, one Redis stream per (event type, bucket): `telemetry-agg-stream:<event>:<bucket>`,
30 buckets by hash of `distinctId`.

- **Never discover buffered events by key pattern.** Shards are reached by iterating the event list x
  buckets; a keyspace scan per run cost about 73s of Redis CPU every 10 minutes in the old layout.
- **A `distinctId` always hashes to the same bucket**, or it produces one aggregated event per shard.
- **Trim a shard only after `flush()` delivers.** `capture()` enqueues asynchronously, so the drain yields a
  macrotask (`settleCapturedEvents`) before `flush()`, otherwise flush sends nothing and the trim loses the
  batch. `telemetry-posthog-delivery.test.ts` guards this with a real client; a mocked client cannot.
- **The PostHog queue evicts the oldest on overflow**, so the client gets `maxQueueSize` = collect ceiling
  x `BUCKET_CONCURRENCY`. Do not switch to `captureImmediate` (one request per event, swallows errors).
  Keep both the per-shard collect ceiling and `BUCKET_CONCURRENCY` low; they multiply.
- **Two bounds per shard:** `MAXLEN ~` 100k on write, and a 30-minute age trim at the top of every cron
  run, outside the drain's error scope so a failing publish still ages entries out.
- **Every shard has a 1-hour `EXPIRE`**, set in the `XADD`'s `MULTI` and refreshed each run, to reap shards
  the cron stops visiting. It must stay above the 30-minute retention, and the cron interval below it.
- **Removing an event type, lowering the bucket count, or a rollback orphans live shards**; the TTL drops
  their entries. To hand off an event type cleanly, keep it in the list for one release.
- All four limits emit `recordProductAnalytics*Metric` (labelled by event type only). Read them before
  changing a limit; the operator view is `docs/self-hosting/guides/monitoring-telemetry.mdx`.
