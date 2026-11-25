import { randomUUID } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import type { TAuditLogs } from "@app/db/schemas";
import { buildAuditLog } from "@app/domains/platform/audit-log/ce/testing/build-audit-log";
import { FakeInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/testing/fake-instance-config-service";

import { FakeAuditLogIngestionMetrics } from "../../testing/fake-audit-log-ingestion-metrics";
import { buildInMemoryAuditLogTransactions } from "../../testing/in-memory-audit-log-store";
import { InMemoryAuditLogWriter } from "../../testing/in-memory-audit-log-writer";
import type { TAuditLogConsumer, TAuditLogWriter } from "../dependencies";
import { PostgresAuditLogWriter } from "../helpers/postgres-audit-log-writer";
import { AuditLogIngestionService } from "./service";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const STREAM_KEY = "audit-log-stream";
const NUL = String.fromCharCode(0);
const ESC = String.fromCharCode(0x1b);
const RLO = String.fromCodePoint(0x202e);

class RecordingConsumer implements TAuditLogConsumer {
  readonly name = "recording-consumer";

  batches: TAuditLogs[][] = [];

  failNext = false;

  onDeliver: (() => Promise<void>) | null = null;

  async deliver(rows: TAuditLogs[]) {
    await this.onDeliver?.();
    if (this.failNext) {
      this.failNext = false;
      throw new Error("consumer down");
    }
    this.batches.push(rows);
  }

  get ids() {
    return this.batches.flat().map((row) => row.id);
  }
}

// What a recorder appended: org, expiry and project name are already resolved.
const bufferedEntry = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  orgId: "org-1",
  createdAt: "2026-05-27T00:00:00.000Z",
  expiresAt: "2026-06-26T00:00:00.000Z",
  event: { type: "test-event", metadata: { k: "v" } },
  actor: { type: "platform", metadata: {} },
  ...overrides
});

const setup = ({ writer }: { writer?: TAuditLogWriter } = {}) => {
  const { keyStore, buffer } = buildAuditLog();
  const memoryWriter = new InMemoryAuditLogWriter("postgres");
  const consumer = new RecordingConsumer();
  const metrics = new FakeAuditLogIngestionMetrics();
  const activeWriter = writer ?? memoryWriter;
  const service = new AuditLogIngestionService(buffer, activeWriter, () => [consumer], metrics);

  const push = async (...entries: unknown[]) => {
    for (const entry of entries) {
      // eslint-disable-next-line no-await-in-loop
      await keyStore.streamAdd(STREAM_KEY, "*", { data: typeof entry === "string" ? entry : JSON.stringify(entry) });
    }
  };
  const buffered = async () => (await buffer.collect({ batchSize: 100, maxEntries: 100 })).entries.length;

  return { service, keyStore, buffer, writer: memoryWriter, consumer, metrics, push, buffered };
};

describe("AuditLogIngestionService.drain", () => {
  test("should do nothing when the buffer is empty", async () => {
    // Setup
    const { service, writer, consumer } = setup();

    // Action
    await service.drain();

    // Assert
    expect(writer.insertCalls).toBe(0);
    expect(consumer.batches).toEqual([]);
  });

  test("should store, then deliver, then trim", async () => {
    // Setup
    const { service, writer, consumer, push, buffered } = setup();
    const entry = bufferedEntry();
    await push(entry);
    const seenAtDelivery: { stored: string[]; buffered: number }[] = [];
    consumer.onDeliver = async () => {
      seenAtDelivery.push({ stored: writer.rows.map((row) => row.id), buffered: await buffered() });
    };

    // Action
    await service.drain();

    // Assert
    expect(seenAtDelivery).toEqual([{ stored: [entry.id], buffered: 1 }]);
    expect(consumer.ids).toEqual([entry.id]);
    expect(await buffered()).toBe(0);
  });

  test("should leave the buffer untrimmed when the insert fails and store the same ids on the next drain", async () => {
    // Setup
    const { service, writer, consumer, push, buffered } = setup();
    const [a, b] = [bufferedEntry(), bufferedEntry()];
    await push(a, b);
    writer.failNextInsert();

    // Action
    await service.drain();

    // Assert
    expect(writer.rows).toEqual([]);
    expect(consumer.batches).toEqual([]);
    expect(await buffered()).toBe(2);

    // Action
    await service.drain();

    // Assert
    expect(writer.rows.map((row) => row.id)).toEqual([a.id, b.id]);
    expect(consumer.ids).toEqual([a.id, b.id]);
    expect(await buffered()).toBe(0);
  });

  test("should leave the buffer untrimmed when a consumer fails and redeliver on the next drain", async () => {
    // Setup
    const { service, writer, consumer, push, buffered } = setup();
    const entry = bufferedEntry();
    await push(entry);
    consumer.failNext = true;

    // Action
    await service.drain();

    // Assert
    expect(writer.rows.map((row) => row.id)).toEqual([entry.id]);
    expect(await buffered()).toBe(1);

    // Action
    await service.drain();

    // Assert
    expect(writer.rows).toHaveLength(1);
    expect(consumer.ids).toEqual([entry.id]);
    expect(await buffered()).toBe(0);
  });

  test("should skip corrupt JSON and entries missing the org or expiry, store the rest and trim all", async () => {
    // Setup
    const { service, writer, consumer, push, buffered } = setup();
    const good = bufferedEntry();
    await push("not-json{", bufferedEntry({ orgId: undefined }), bufferedEntry({ expiresAt: undefined }), "42", good);

    // Action
    await service.drain();

    // Assert
    expect(writer.rows.map((row) => row.id)).toEqual([good.id]);
    expect(consumer.ids).toEqual([good.id]);
    expect(await buffered()).toBe(0);
  });

  test("should trim a batch where every entry is skipped without storing or delivering", async () => {
    // Setup
    const { service, writer, consumer, push, buffered } = setup();
    await push("not-json{", bufferedEntry({ orgId: undefined }));

    // Action
    await service.drain();

    // Assert
    expect(writer.insertCalls).toBe(0);
    expect(consumer.batches).toEqual([]);
    expect(await buffered()).toBe(0);
  });

  test("should do nothing while another holder has the drain lock", async () => {
    // Setup
    const { service, keyStore, writer, consumer, push, buffered } = setup();
    await push(bufferedEntry());
    await keyStore.acquireLock(["audit-log-ingest:consumer-lock"]);

    // Action
    await service.drain();

    // Assert
    expect(writer.insertCalls).toBe(0);
    expect(consumer.batches).toEqual([]);
    expect(await buffered()).toBe(1);
  });

  test("should free the drain lock when the drain throws", async () => {
    // Setup
    const { service, keyStore, writer, push } = setup();
    await push(bufferedEntry());
    const collect = keyStore.streamCollect;
    keyStore.streamCollect = async () => {
      throw new Error("redis hiccup");
    };
    await expect(service.drain()).rejects.toThrow("redis hiccup");
    keyStore.streamCollect = collect;

    // Action
    await service.drain();

    // Assert
    expect(writer.rows).toHaveLength(1);
  });

  test("should record how long storing took and whether it worked", async () => {
    // Setup
    const { service, writer, metrics, push } = setup();
    await push(bufferedEntry());
    writer.failNextInsert();

    // Action
    await service.drain();
    await service.drain();

    // Assert
    expect(metrics.persisted.map(({ backend, outcome }) => ({ backend, outcome }))).toEqual([
      { backend: "postgres", outcome: "failure" },
      { backend: "postgres", outcome: "success" }
    ]);
  });
});

describe("AuditLogIngestionService.drain with the Postgres writer", () => {
  const setupPostgres = (disabled: boolean) => {
    const { auditLogStore, transactionRunner } = buildInMemoryAuditLogTransactions();
    const instanceConfig = new FakeInstanceConfigService({ env: { DISABLE_POSTGRES_AUDIT_LOG_STORAGE: disabled } });
    const writer = new PostgresAuditLogWriter(transactionRunner, instanceConfig);
    return { ...setup({ writer }), auditLogStore };
  };

  test("should store the rows and deliver them to the consumers", async () => {
    // Setup
    const { service, auditLogStore, consumer, push, buffered } = setupPostgres(false);
    const entry = bufferedEntry();
    await push(entry);

    // Action
    await service.drain();

    // Assert
    expect(auditLogStore.rows.map((row) => row.id)).toEqual([entry.id]);
    expect(consumer.ids).toEqual([entry.id]);
    expect(await buffered()).toBe(0);
  });

  test("should still deliver to the consumers and trim when Postgres storage is disabled", async () => {
    // Setup
    const { service, auditLogStore, consumer, push, buffered } = setupPostgres(true);
    const entry = bufferedEntry();
    await push(entry);

    // Action
    await service.drain();

    // Assert
    expect(auditLogStore.rows).toEqual([]);
    expect(consumer.ids).toEqual([entry.id]);
    expect(await buffered()).toBe(0);
  });
});

describe("AuditLogIngestionService.drain row shape", () => {
  const setupClickhouse = () => {
    const writer = new InMemoryAuditLogWriter("clickhouse");
    return { ...setup({ writer }), clickhouseWriter: writer };
  };

  test("should store empty values as null and keep the project name for Postgres", async () => {
    // Setup
    const { service, writer, push } = setup();
    await push(bufferedEntry({ projectId: "p1", projectName: "proj", ipAddress: undefined }));

    // Action
    await service.drain();

    // Assert
    const [row] = writer.rows;
    expect(row).toMatchObject({ ipAddress: null, userAgent: null, userAgentType: null, projectId: "p1" });
    expect(row.projectName).toBe("proj");
    expect(row.orgId).toBe("org-1");
  });

  test("should store empty values as empty strings and no project name for ClickHouse", async () => {
    // Setup
    const { service, clickhouseWriter, push } = setupClickhouse();
    await push(bufferedEntry({ projectName: "proj", ipAddress: undefined }));

    // Action
    await service.drain();

    // Assert
    const [row] = clickhouseWriter.rows;
    expect(row).toMatchObject({ ipAddress: "", userAgent: "", userAgentType: "", projectId: "" });
    expect(row).not.toHaveProperty("projectName");
  });

  describe("free text", () => {
    const hostileEntry = () =>
      bufferedEntry({
        projectId: "p1",
        projectName: `proj${RLO}x`,
        ipAddress: `1.1.1.1${String.fromCharCode(0x9b)}[31m`,
        userAgent: `Agent/1.0${ESC}[31m`,
        actor: { type: "user", metadata: { name: `svc${NUL}acct` } },
        event: {
          type: "test-event",
          metadata: { reason: `approved by${String.fromCharCode(10)}ops`, nested: { note: `a${RLO}b` } }
        }
      });

    const expectClean = (row: TAuditLogs, { withProjectName = true } = {}) => {
      if (withProjectName) expect(row.projectName).toBe("projx");
      expect(row.ipAddress).toBe("1.1.1.1[31m");
      expect(row.userAgent).toBe("Agent/1.0");
      expect((row.actorMetadata as Record<string, unknown>).name).toBe("svcacct");
      const eventMetadata = row.eventMetadata as Record<string, unknown>;
      expect(eventMetadata.reason).toBe(`approved by${String.fromCharCode(10)}ops`);
      expect((eventMetadata.nested as Record<string, unknown>).note).toBe("ab");
    };

    test("should sanitize what Postgres stores and what the consumers receive", async () => {
      // Setup
      const { service, writer, consumer, push } = setup();
      await push(hostileEntry());

      // Action
      await service.drain();

      // Assert
      expectClean(writer.rows[0]);
      expectClean(consumer.batches[0][0]);
    });

    test("should sanitize what ClickHouse stores", async () => {
      // Setup
      const { service, clickhouseWriter, push } = setupClickhouse();
      await push(hostileEntry());

      // Action
      await service.drain();

      // Assert
      expectClean(clickhouseWriter.rows[0], { withProjectName: false });
    });

    test("should keep legitimate deep nesting intact while sanitizing", async () => {
      // Setup
      const { service, writer, push } = setup();
      let claims: Record<string, unknown> = { sub: `id${NUL}1`, keep: 7 };
      for (let i = 0; i < 20; i += 1) claims = { nested: claims };
      await push(bufferedEntry({ event: { type: "test-event", metadata: { oidcClaimsReceived: claims } } }));

      // Action
      await service.drain();

      // Assert
      let cursor = (writer.rows[0].eventMetadata as Record<string, unknown>).oidcClaimsReceived as Record<
        string,
        unknown
      >;
      for (let i = 0; i < 20; i += 1) cursor = cursor.nested as Record<string, unknown>;
      expect(cursor).toEqual({ sub: "id1", keep: 7 });
    });
  });
});
