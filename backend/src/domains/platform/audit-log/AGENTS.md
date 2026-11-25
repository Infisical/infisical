# Audit Log domain

Writing audit logs: what every domain records through, and the ingestion that stores what was recorded. Reading
logs, settings, and customer log streams are not here yet (see "Declared exceptions").

Two services, split by who calls them, like Events:

- `auditLogRecorderService: TAuditLogRecorderService` (`ce/`) is what every domain takes to record.
  - `record(actor, { event, projectId? })` decides and appends. At most once: a failure is logged and counted
    (`infisical.audit_log.dropped.count`), never thrown, so it can't fail the caller's request.
  - `recordOrThrow` throws instead, for a caller that retries.
  - `recordResolved` is for the legacy adapter only (`ee/services/audit-log/audit-log-queue.ts`), which resolves
    the org, project and settings itself.
- `auditLogIngestionService: TAuditLogIngestionService` (`ee/`) is what the ingestion worker calls: `drain()` stores
  the buffer in Postgres or ClickHouse, hands the stored batch to the consumers, then trims the buffer.

## Recording

- **The recorder looks nothing up itself.** The plan's retention, the project's name and retention, and the
  event-class switches come from the actor context's `audit` key (`TActorAuditConfig` in `domains/lib/actor-context`),
  which the top level fills in (`server/lib/actor-context-builder.ts` over `server/lib/audit-config-source.ts`). It
  loads on first use and remembers the answer for the context's life. A caller passes only the event and, for a
  project event, the project id.
- **The decision is one model.** `AuditLogPolicy` says whether an event is kept (the plan keeps logs, and a
  switchable class is on) and until when (the project's retention within the plan's, capped at 2100-01-01 for
  ClickHouse). `AuditLogEntry.create` returns `null` for a dropped event. Management and data-access events never read
  the switches.
- **A project id from another org is refused** (counted as `recording_refused`), so a wrong id can't write into
  another tenant's log. So is a hard-deleted project's; a soft-deleted one still resolves, so a deletion is logged
  under its project. The legacy adapter, which has the org from the request, still records a hard-deleted project's
  logs, under the plan's retention.
- **Record after your transaction commits**, outside `run`: an entry for a write that rolled back is a false record,
  and appending is a Redis call.
- **The catalog owns its payloads.** `ce/models/catalog/` holds every event's metadata type with no imports from
  other modules: enums become string-literal unions with every value (so a new enum value fails compilation at the
  call site until the catalog lists it), and DTOs become snapshot types. A change to a service's DTO must never
  change what audit logs and log streams store. `ce/models/event-type.ts` and `event-class.ts` are the vocabulary.

## Ingestion

- **Frozen for rolling deploys:** the Redis stream `audit-log-stream`, the drain lock
  `audit-log-ingest:consumer-lock`, the queue `audit-log-clickhouse-batch` and its scheduler
  `jsv1:audit-log-clickhouse-batch` (every 5s, armed only on general-worker pods), and the buffered entry's JSON
  (`TAuditLogEntryRecord`: fields may be added, never renamed or removed). Old pods append to and drain the same
  stream.
- A failed store or delivery leaves the buffer untrimmed; the next drain retries the same batch. Storage is
  idempotent on `id` (Postgres `ON CONFLICT DO NOTHING`, ClickHouse `ReplacingMergeTree`), and consumers must be too.
  A corrupt entry, or one without `orgId`/`expiresAt`, is skipped and trimmed.
- `DISABLE_POSTGRES_AUDIT_LOG_STORAGE` is read per batch from Instance Config Core. With it on, nothing is stored in
  Postgres but consumers still receive the batch, so log streams keep working.
- **Consumers** (`TAuditLogConsumer`) receive each stored batch. Push, not pull: storing and delivering are retried
  together, and consumers can't read `audit_logs` because it may not be written.

## Declared exceptions

- **The legacy log stream outbox registers as a consumer** (`AuditLogEeModule.registerConsumer`, sealed by
  `start()`), because it is built in `routes/index.ts` after the domains. When log streams become their own domain
  (Audit Log Streams, depending on this one, KMS Core, Alerting and Organizations & Projects), it is passed to the
  constructor instead and `registerConsumer` goes away.
- **The audit configuration comes from legacy code at the top level.** `AuditConfigSource` reads the plan, the
  project row (cached in Redis under `KeyStorePrefixes.AuditLogProjectConfig`, cleared by `project-service` when the
  name or retention changes) and `auditLogSettingsService`. No domain takes them; only that file changes when
  retention and settings move to their owners.
- **This domain writes `audit_logs`; legacy code still reads it** (`audit-log-dal.ts`, `audit-log-clickhouse-dal.ts`:
  listing, insights, the daily prune) until the query path moves here.
- **Ingestion starts from `routes/index.ts`, not `main()`**: `start()` seals the consumers, and the legacy outbox
  registers there. It moves to `main()` with the outbox.
- **Shapes that aren't one-field-per-property models:** `AuditLogActor` wraps its record, a union with a different
  metadata shape per actor type. `models/event-type.ts`, `event-class.ts` and `catalog/` are the event vocabulary
  (enums, the class tables, payload types), like `models/permissions/` elsewhere. `AuditLogBuffer` is neither a store
  nor a cache: a Redis stream other pods drain.
- **Collapsed recording and permission-denied recording stay legacy** (`audit-log-service.ts`) and go through the
  adapter.

## Testing

- Unit: models, the recorder (`testing/build-audit-log.ts`), the buffer contract on `InMemoryKeyStore`, ingestion
  on an in-memory writer, and the top-level `server/lib/*` pieces.
- `src/ee/services/audit-log/audit-log-catalog.test.ts` pins the catalog to its producers at compile time: every
  enum literal union equals its source enum, and every snapshot type accepts the type it replaced. A failure there
  means a producer changed: update the catalog deliberately.
- Integration (`*.integration-test.ts`): the store contract (`ee/testing/audit-log-store-contract.ts`, also run on the
  in-memory store) and ingestion into real `audit_logs`, including a failed insert leaving the buffer untrimmed. The buffer contract
  runs only in memory: the integration harness has no Redis server yet.
- Blackbox: `tests/suites/secretmanager/auditlogs/` and `tests/suites/auditlog/` cover recording, retention, settings
  and stream delivery end to end.
