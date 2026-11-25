import type { ClickHouseClient as TClickHouseDriver } from "@clickhouse/client";

import type { TDbClient } from "@app/db";
import { singleStoreConnection } from "@app/domains/lib/data-access";
import type { TDomainQueue } from "@app/domains/lib/jobs";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TransactionRunner } from "@app/domains/lib/transactions";
import type { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import type { QueueJobs, QueueName } from "@app/queue";

import { AuditLogBuffer } from "../ce/data-access/audit-log-buffer";
import { ClickHouseClient } from "./clients/clickhouse/client";
import { OtelMetricsClient } from "./clients/otel-metrics/client";
import { AuditLogStore } from "./data-access/audit-log-store";
import { AuditLogIngestionService, TAuditLogIngestionService } from "./services/audit-log-ingestion/service";
import type { TAuditLogConsumer, TAuditLogStores, TAuditLogWriter } from "./services/dependencies";
import { PostgresAuditLogStorageService } from "./services/postgres-audit-log-storage/service";

export type { TAuditLogIngestionService } from "./services/audit-log-ingestion/service";
export type { TAuditLogConsumer } from "./services/dependencies";

// Frozen: old pods share the queue and its scheduler during a rolling deploy. The scheduler keeps its historical
// ClickHouse name so the existing Redis scheduler key isn't orphaned. Cast because @app/queue is in an import cycle
// with crypto.
const IngestionQueue = {
  name: "audit-log-clickhouse-batch" as QueueName.AuditLogClickHouseBatch,
  job: "audit-log-clickhouse-batch-job" as QueueJobs.AuditLogClickHouseBatch,
  schedulerId: "jsv1:audit-log-clickhouse-batch",
  everyMs: 5000
};

export type TAuditLogEeDeps = {
  // The audit log database when one is configured, else the main one.
  db: TDbClient;
  keyStore: TDomainKeyStore;
  queueService: TDomainQueue;
  instanceConfigService: TInstanceConfigService;
  clickhouse: {
    driver: TClickHouseDriver;
    tableName: string;
    insertSettings: Record<string, string | number | boolean>;
  } | null;
  isGeneralWorkerRunModeEnabled: boolean;
};

// Ingestion: drains the audit log buffer into Postgres or ClickHouse and hands each stored batch to the consumers.
export class AuditLogEeModule {
  readonly auditLogIngestionService: TAuditLogIngestionService;

  private readonly consumers: TAuditLogConsumer[] = [];

  private isStarted = false;

  constructor(private readonly deps: TAuditLogEeDeps) {
    const writer: TAuditLogWriter = deps.clickhouse
      ? new ClickHouseClient(deps.clickhouse.driver, deps.clickhouse.tableName, deps.clickhouse.insertSettings)
      : new PostgresAuditLogStorageService(
          new TransactionRunner<TAuditLogStores>(deps.db, (trx, locks) => ({
            auditLogStore: new AuditLogStore(singleStoreConnection(trx)),
            locks
          })),
          deps.instanceConfigService
        );
    this.auditLogIngestionService = new AuditLogIngestionService(
      new AuditLogBuffer(deps.keyStore),
      writer,
      () => this.consumers,
      new OtelMetricsClient()
    );
  }

  // Only while wiring, and only for the legacy log stream outbox, which is built after the domains. When log streams
  // become a domain, it is passed to the constructor instead and this goes away.
  registerConsumer(consumer: TAuditLogConsumer): void {
    if (this.isStarted) {
      throw new Error(`audit-log: consumer '${consumer.name}' registered after start; it would miss stored batches`);
    }
    this.consumers.push(consumer);
  }

  // Call once at boot, after the consumers are registered.
  async start(): Promise<void> {
    this.isStarted = true;
    this.deps.queueService.start(IngestionQueue.name, async () => this.auditLogIngestionService.drain());
    // Only the fleet that consumes this queue arms its scheduler: an api pod has no worker on it, so arming it there
    // would schedule ticks nobody drains.
    if (!this.deps.isGeneralWorkerRunModeEnabled) return;
    await this.deps.queueService.upsertJobScheduler(
      IngestionQueue.name,
      IngestionQueue.schedulerId,
      { every: IngestionQueue.everyMs },
      { name: IngestionQueue.job }
    );
  }
}
