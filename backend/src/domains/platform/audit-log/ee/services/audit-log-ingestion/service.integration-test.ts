import { TableName, type TAuditLogs } from "@app/db/schemas";
import { FakeQueue } from "@app/domains/lib/jobs/testing/fake-queue";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { AuditLogModule, EventType } from "@app/domains/platform/audit-log/ce/module";
import { FakeInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/testing/fake-instance-config-service";
import { ActorType } from "@app/lib/auth/actor-types";

import { AuditLogEeModule } from "../../module";

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
    const days = (new Date(stored[0].expiresAt).getTime() - new Date(stored[0].createdAt).getTime()) / 86_400_000;
    expect(days).toBe(7);
    expect(delivered.map((row) => row.id)).toEqual([stored[0].id]);
    expect((await keyStore.streamCollect("audit-log-stream", 10, 10)).entries).toHaveLength(0);
  });
});
