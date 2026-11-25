import { TableName, type TAuditLogs } from "@app/db/schemas";
import { singleStoreConnection } from "@app/domains/lib/data-access";
import { FakeQueue } from "@app/domains/lib/jobs/testing/fake-queue";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { TransactionRunner } from "@app/domains/lib/transactions";
import { AuditLogModule, EventType } from "@app/domains/platform/audit-log/ce/module";
import { FakeInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/testing/fake-instance-config-service";
import { ActorType } from "@app/lib/auth/actor-types";

import { AuditLogBuffer } from "../../../ce/data-access/audit-log-buffer";
import { AuditLogStore } from "../../data-access/audit-log-store";
import { AuditLogEeModule } from "../../module";
import { FakeAuditLogIngestionMetrics } from "../../testing/fake-audit-log-ingestion-metrics";
import type { TAuditLogStores } from "../dependencies";
import { PostgresAuditLogStorageService } from "../postgres-audit-log-storage/service";
import { AuditLogIngestionService } from "./service";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe("AuditLogIngestionService.drain on Postgres", () => {
  const h = setupIntegration();

  const build = () => {
    const keyStore = new InMemoryKeyStore();
    const recorder = new AuditLogModule({ keyStore, useTimeOrderedIds: false }).auditLogRecorderService;
    const ingestion = new AuditLogEeModule({
      db: h.db,
      keyStore,
      queueService: new FakeQueue() as never,
      instanceConfigService: new FakeInstanceConfigService(),
      clickhouse: null,
      isGeneralWorkerRunModeEnabled: false
    });
    const delivered: TAuditLogs[] = [];
    ingestion.registerConsumer({
      name: "it",
      deliver: async (rows) => {
        delivered.push(...rows);
      }
    });
    return { keyStore, recorder, ingestion, delivered };
  };

  test("should store recorded logs in audit_logs, hand them to the consumer and empty the buffer", async () => {
    // Setup
    const tn = await h.newTenant();
    const { keyStore, recorder, ingestion, delivered } = build();
    await recorder.recordResolved({
      orgId: tn.org.id,
      project: { id: tn.project.id, name: tn.project.name },
      policy: { retentionDays: 30, projectRetentionDays: 7 },
      event: { type: EventType.CREATE_SECRET, metadata: { secretKey: "KEY" } } as never,
      actor: { type: ActorType.PLATFORM, metadata: {} }
    });

    // Action
    await ingestion.auditLogIngestionService.drain();

    // Assert
    const stored = await h.db(TableName.AuditLog).where({ orgId: tn.org.id });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ projectId: tn.project.id, projectName: tn.project.name });
    const days = ((stored[0].expiresAt as Date).getTime() - (stored[0].createdAt as Date).getTime()) / 86_400_000;
    expect(days).toBe(7);
    expect(delivered.map((row) => row.id)).toEqual([stored[0].id]);
    expect((await keyStore.streamCollect("audit-log-stream", 10, 10)).entries).toHaveLength(0);
  });

  test("should leave the buffer untrimmed when Postgres fails the insert, and store the batch on the next drain", async () => {
    // Setup
    const tn = await h.newTenant();
    const keyStore = new InMemoryKeyStore();
    const recorder = new AuditLogModule({ keyStore, useTimeOrderedIds: false }).auditLogRecorderService;
    let transactions = 0;
    // The first transaction fails inside Postgres and rolls back, like a lost connection mid-batch.
    const transactionRunner = new TransactionRunner<TAuditLogStores>(h.db, (trx, locks) => {
      transactions += 1;
      const failing = transactions === 1;
      return {
        auditLogStore: failing
          ? {
              insertBatch: async () => {
                await trx.raw("select 1 / 0");
              }
            }
          : new AuditLogStore(singleStoreConnection(trx)),
        locks
      };
    });
    const ingestion = new AuditLogIngestionService(
      new AuditLogBuffer(keyStore),
      new PostgresAuditLogStorageService(transactionRunner, new FakeInstanceConfigService()),
      () => [],
      new FakeAuditLogIngestionMetrics()
    );
    await recorder.recordResolved({
      orgId: tn.org.id,
      policy: { retentionDays: 30 },
      event: { type: EventType.CREATE_SECRET, metadata: { secretKey: "KEY" } } as never,
      actor: { type: ActorType.PLATFORM, metadata: {} }
    });
    await ingestion.drain();
    const afterFailure = (await keyStore.streamCollect("audit-log-stream", 10, 10)).entries.length;

    // Action
    await ingestion.drain();

    // Assert
    expect(afterFailure).toBe(1);
    expect(await h.db(TableName.AuditLog).where({ orgId: tn.org.id })).toHaveLength(1);
    expect((await keyStore.streamCollect("audit-log-stream", 10, 10)).entries).toHaveLength(0);
  });
});
