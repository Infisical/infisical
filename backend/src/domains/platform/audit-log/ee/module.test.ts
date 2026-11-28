import { randomUUID } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import type { TAuditLogs } from "@app/db/schemas";
import type { TDomainQueue } from "@app/domains/lib/jobs";
import { FakeQueue } from "@app/domains/lib/jobs/testing/fake-queue";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { FakeInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/testing/fake-instance-config-service";
import { QueueName } from "@app/queue";

import { AuditLogEeModule } from "./module";
import type { TAuditLogConsumer } from "./services/dependencies";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const SCHEDULER_ID = "jsv1:audit-log-clickhouse-batch";

const setup = ({ isGeneralWorkerRunModeEnabled = true, postgresStorageDisabled = false } = {}) => {
  const queue = new FakeQueue();
  const keyStore = new InMemoryKeyStore();
  const module = new AuditLogEeModule({
    db: {} as never,
    keyStore,
    queueService: queue as unknown as TDomainQueue,
    instanceConfigService: new FakeInstanceConfigService({
      env: { DISABLE_POSTGRES_AUDIT_LOG_STORAGE: postgresStorageDisabled }
    }),
    clickhouse: null,
    isGeneralWorkerRunModeEnabled
  });
  return { module, queue, keyStore };
};

class RecordingConsumer implements TAuditLogConsumer {
  readonly name = "recording-consumer";

  rows: TAuditLogs[] = [];

  async deliver(rows: TAuditLogs[]) {
    this.rows.push(...rows);
  }
}

describe("AuditLogEeModule.registerConsumer", () => {
  test("should refuse a consumer registered after start", async () => {
    // Setup
    const { module } = setup();
    await module.start();

    // Action
    const register = () => module.registerConsumer(new RecordingConsumer());

    // Assert
    expect(register).toThrow("consumer 'recording-consumer' registered after start");
  });

  test("should deliver a drained batch to a consumer registered before start", async () => {
    // Setup
    const { module, queue, keyStore } = setup({ postgresStorageDisabled: true });
    const consumer = new RecordingConsumer();
    module.registerConsumer(consumer);
    const id = randomUUID();
    await keyStore.streamAdd("audit-log-stream", "*", {
      data: JSON.stringify({
        id,
        orgId: "org-1",
        createdAt: "2026-05-27T00:00:00.000Z",
        expiresAt: "2026-06-26T00:00:00.000Z",
        event: { type: "test-event", metadata: {} },
        actor: { type: "platform", metadata: {} }
      })
    });
    await module.start();

    // Action
    await queue.tick(QueueName.AuditLogClickHouseBatch);

    // Assert
    expect(consumer.rows.map((row) => row.id)).toEqual([id]);
  });
});

describe("AuditLogEeModule.start", () => {
  test("should arm the scheduler every 5000 ms and start the worker in the general worker run mode", async () => {
    // Setup
    const { module, queue } = setup({ isGeneralWorkerRunModeEnabled: true });

    // Action
    await module.start();

    // Assert
    expect(queue.schedulers.get(SCHEDULER_ID)).toEqual({ queue: QueueName.AuditLogClickHouseBatch, every: 5000 });
    expect(queue.handlers.has(QueueName.AuditLogClickHouseBatch)).toBe(true);
  });

  test("should start the worker but not arm the scheduler outside the general worker run mode", async () => {
    // Setup
    const { module, queue } = setup({ isGeneralWorkerRunModeEnabled: false });

    // Action
    await module.start();

    // Assert
    expect(queue.schedulers.size).toBe(0);
    expect(queue.handlers.has(QueueName.AuditLogClickHouseBatch)).toBe(true);
  });
});
