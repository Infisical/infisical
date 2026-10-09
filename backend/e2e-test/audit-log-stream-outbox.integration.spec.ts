import { randomUUID } from "node:crypto";

import { createFakeWebhookServer, TFakeWebhookServer } from "e2e-test/fakes/webhook-destination";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { Knex } from "knex";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { auditLogStreamDALFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-dal";
import { LogProvider, StreamMode } from "@app/ee/services/audit-log-stream/audit-log-stream-enums";
import {
  AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
  AuditLogStreamDeliveryFailedPayloadSchema,
  emitAuditLogStreamDeliveryFailed
} from "@app/ee/services/audit-log-stream/audit-log-stream-events";
import { encryptLogStreamCredentials } from "@app/ee/services/audit-log-stream/audit-log-stream-fns";
import { auditLogStreamOutboxDALFactory } from "@app/ee/services/audit-log-stream-outbox/audit-log-stream-outbox-dal";
import { auditLogStreamOutboxServiceFactory } from "@app/ee/services/audit-log-stream-outbox/audit-log-stream-outbox-service";
import { AuditLogStreamOutboxStatus } from "@app/ee/services/audit-log-stream-outbox/audit-log-stream-outbox-types";
import { initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { eventOutboxDALFactory } from "@app/services/event-outbox/event-outbox-dal";
import { eventOutboxRegistryFactory } from "@app/services/event-outbox/event-outbox-registry";
import { eventOutboxServiceFactory } from "@app/services/event-outbox/event-outbox-service";

declare const testDb: Knex;

// This is an integration test, not an end-to-end one: it builds the outbox service on the test
// database and calls it directly, so it never goes through the HTTP API. Streams are created with
// the test DB because the e2e license has audit log streams off and nothing over HTTP triggers a
// drain or exposes a stream's failing state. The org is a fresh isolated one, deleted at the end,
// which cascades to its streams and outbox rows.
//
// Unit tests mock the DAL, so they cannot show that the stream health flip, the dropped rows and the
// alert event really commit or roll back together, that two workers racing for the same drop emit
// once, or that a receiver answering 500 ends in a failing stream. Real Postgres and a real HTTP
// receiver can. Retries are not waited out: rows are seeded at attempts = 4, so the next failure is the
// one that exhausts them, and the tests call the service and DAL directly instead of going through the
// 5s flush debounce.

let orgId: string;
let cleanupOrg: () => Promise<void>;
const CONSUMER = `e2e-als-${randomUUID().slice(0, 8)}`;
const LAST_ATTEMPT = 4;

// Stands in for the org KMS key: these tests are about the outbox, not about encryption, and the
// server does not expose its KMS service. Flip decryptShouldFail to simulate a broken key.
let decryptShouldFail = false;
const kmsService = {
  createCipherPairWithDataKey: async () => ({
    encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
    decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => {
      if (decryptShouldFail) throw new Error("kms unreachable");
      return cipherTextBlob;
    }
  })
};

const auditLogStreamDAL = auditLogStreamDALFactory(testDb as never);
const outboxDAL = auditLogStreamOutboxDALFactory(testDb as never);

const eventOutboxRegistry = eventOutboxRegistryFactory();
eventOutboxRegistry.register({
  name: CONSUMER,
  payloadSchema: AuditLogStreamDeliveryFailedPayloadSchema as never,
  subscribesTo: (eventType) => eventType === AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
  handle: async () => []
});
const eventEmitter = eventOutboxServiceFactory({
  eventOutboxDAL: eventOutboxDALFactory(testDb as never),
  eventOutboxRegistry
});

const service = auditLogStreamOutboxServiceFactory({
  auditLogStreamOutboxDAL: outboxDAL,
  auditLogStreamDAL,
  projectDAL: { findProjectTypesByIds: async () => [] },
  kmsService: kmsService as never,
  // Required by the factory; drainStream never touches it.
  keyStore: { setItemWithExpiryNX: async () => null },
  queueService: {} as never,
  eventEmitter
});

const createStream = async (url: string) => {
  const encryptedCredentials = await encryptLogStreamCredentials({
    orgId,
    credentials: { url, headers: [] },
    kmsService: kmsService as never
  });
  const [stream] = await testDb(TableName.AuditLogStream)
    .insert({ orgId, provider: LogProvider.Custom, encryptedCredentials, streamMode: StreamMode.Batch })
    .returning("*");
  return stream as { id: string };
};

const seedRow = async (
  streamId: string,
  overrides: { attempts?: number; status?: AuditLogStreamOutboxStatus; lockedAt?: Date } = {}
) => {
  const auditLogId = randomUUID();
  const [row] = await testDb(TableName.AuditLogStreamOutbox)
    .insert({
      streamId,
      orgId,
      auditLogId,
      payload: JSON.stringify({ id: auditLogId, orgId, eventType: "e2e.event" }),
      status: overrides.status ?? AuditLogStreamOutboxStatus.Pending,
      attempts: overrides.attempts ?? 0,
      nextRetryAt: new Date(Date.now() - 1_000),
      lockedAt: overrides.lockedAt ?? null
    })
    .returning("*");
  return Number((row as { id: string | number }).id);
};

const outboxRow = (id: number) => testDb(TableName.AuditLogStreamOutbox).where({ id }).first();
const streamHealth = (id: string) =>
  testDb(TableName.AuditLogStream).where({ id }).first("failingSince", "lastDeliveryError");
const events = () => testDb(TableName.EventOutbox).where({ consumer: CONSUMER }).orderBy("id", "asc").select("*");

const drain = (streamId: string) => service.drainStream({ streamId, orgId, provider: LogProvider.Custom });

const cleanupEvents = () => testDb(TableName.EventOutbox).where({ consumer: CONSUMER }).del();

describe("audit log stream outbox (postgres)", () => {
  beforeAll(async () => {
    // Spec files run in a separate module graph from the test server, so the logger and env config the
    // outbox service and the providers read have to be initialized here as well.
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);
    ({ orgId, cleanup: cleanupOrg } = await createIsolatedOrgAndProject("audit-log-stream-outbox-e2e"));
    await cleanupEvents();
  });
  afterEach(cleanupEvents);
  afterAll(async () => {
    await cleanupEvents();
    await cleanupOrg();
  });

  describe("stream health and the alert event commit with the drop", () => {
    test("markStreamFailing flips a healthy stream exactly once under concurrent workers", async () => {
      const stream = await createStream("http://127.0.0.1:1/");

      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          outboxDAL.transaction((tx) => outboxDAL.markStreamFailing({ streamId: stream.id, errorMessage: `w${i}` }, tx))
        )
      );

      expect(results.filter((flippedAt) => flippedAt !== null)).toHaveLength(1);
      const health = await streamHealth(stream.id);
      expect(health?.failingSince).toBeInstanceOf(Date);
      expect(health?.lastDeliveryError).toMatch(/^w[0-4]$/);
    });

    test("clearStreamFailing resets both columns", async () => {
      const stream = await createStream("http://127.0.0.1:1/");
      await outboxDAL.transaction((tx) =>
        outboxDAL.markStreamFailing({ streamId: stream.id, errorMessage: "boom" }, tx)
      );

      await outboxDAL.transaction((tx) => outboxDAL.clearStreamFailing(stream.id, tx));

      expect(await streamHealth(stream.id)).toEqual({ failingSince: null, lastDeliveryError: null });
    });

    test("a rollback undoes the dropped rows, the failing flag and the event together", async () => {
      const stream = await createStream("http://127.0.0.1:1/");
      const rowId = await seedRow(stream.id, { attempts: LAST_ATTEMPT, status: AuditLogStreamOutboxStatus.Processing });

      await expect(
        outboxDAL.transaction(async (tx) => {
          await outboxDAL.commitDeliveryResult({ successIds: [], retriable: null, exhaustedIds: [rowId] }, tx);
          const failingSince = await outboxDAL.markStreamFailing({ streamId: stream.id, errorMessage: "boom" }, tx);
          await emitAuditLogStreamDeliveryFailed(
            eventEmitter,
            {
              orgId,
              streamId: stream.id,
              provider: LogProvider.Custom,
              errorMessage: "boom",
              droppedCount: 1,
              failingSince: failingSince as Date
            },
            tx
          );
          throw new Error("force rollback");
        })
      ).rejects.toThrow("force rollback");

      expect((await outboxRow(rowId))?.status).toBe(AuditLogStreamOutboxStatus.Processing);
      expect(await streamHealth(stream.id)).toEqual({ failingSince: null, lastDeliveryError: null });
      expect(await events()).toHaveLength(0);
    });
  });

  describe("drainStream against a real receiver", () => {
    let receiver: TFakeWebhookServer;

    beforeAll(async () => {
      receiver = await createFakeWebhookServer();
    });
    afterAll(async () => {
      await receiver.stop();
    });
    beforeEach(() => {
      receiver.reset();
      decryptShouldFail = false;
    });

    test("delivers a healthy stream's rows and leaves its health and the event table alone", async () => {
      const stream = await createStream(receiver.url);
      const rowId = await seedRow(stream.id);

      await drain(stream.id);

      expect((await outboxRow(rowId))?.status).toBe(AuditLogStreamOutboxStatus.Delivered);
      expect(receiver.messages()).toHaveLength(1);
      expect(Array.isArray(receiver.messages()[0].body)).toBe(true);
      expect(await streamHealth(stream.id)).toEqual({ failingSince: null, lastDeliveryError: null });
      expect(await events()).toHaveLength(0);
    });

    test("a failure that can still retry does not flag the stream or emit", async () => {
      receiver.setStatusCode(500);
      const stream = await createStream(receiver.url);
      const rowId = await seedRow(stream.id, { attempts: 0 });

      await drain(stream.id);

      const row = await outboxRow(rowId);
      expect(row?.status).toBe(AuditLogStreamOutboxStatus.Retry);
      expect(row?.attempts).toBe(1);
      expect(await streamHealth(stream.id)).toEqual({ failingSince: null, lastDeliveryError: null });
      expect(await events()).toHaveLength(0);
    });

    test("exhausting a row drops it, flags the stream and emits one event", async () => {
      receiver.setStatusCode(500);
      const stream = await createStream(receiver.url);
      const rowIds = [
        await seedRow(stream.id, { attempts: LAST_ATTEMPT }),
        await seedRow(stream.id, { attempts: LAST_ATTEMPT })
      ];

      await drain(stream.id);

      expect(await Promise.all(rowIds.map(outboxRow))).toEqual([undefined, undefined]);
      const health = await streamHealth(stream.id);
      expect(health?.failingSince).toBeInstanceOf(Date);
      expect(health?.lastDeliveryError).toContain("500");

      const emitted = await events();
      expect(emitted).toHaveLength(1);
      expect(emitted[0].eventType).toBe(AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT);
      expect(emitted[0].payload).toMatchObject({
        orgId,
        resourceType: "audit-log.stream",
        resourceId: null,
        targetIds: [stream.id],
        provider: LogProvider.Custom,
        droppedCount: 2
      });
      expect(AuditLogStreamDeliveryFailedPayloadSchema.safeParse(emitted[0].payload).success).toBe(true);
    });

    test("a stream that stays down does not emit again, and keeps its first failure time", async () => {
      receiver.setStatusCode(500);
      const stream = await createStream(receiver.url);
      await seedRow(stream.id, { attempts: LAST_ATTEMPT });
      await drain(stream.id);
      const first = await streamHealth(stream.id);

      await seedRow(stream.id, { attempts: LAST_ATTEMPT });
      await drain(stream.id);

      expect(await events()).toHaveLength(1);
      expect((await streamHealth(stream.id))?.failingSince).toEqual(first?.failingSince);
    });

    test("a delivery after the outage clears the failing state without emitting", async () => {
      receiver.setStatusCode(500);
      const stream = await createStream(receiver.url);
      await seedRow(stream.id, { attempts: LAST_ATTEMPT });
      await drain(stream.id);
      expect((await streamHealth(stream.id))?.failingSince).toBeInstanceOf(Date);

      receiver.setStatusCode(200);
      const rowId = await seedRow(stream.id);
      await drain(stream.id);

      expect((await outboxRow(rowId))?.status).toBe(AuditLogStreamOutboxStatus.Delivered);
      expect(await streamHealth(stream.id)).toEqual({ failingSince: null, lastDeliveryError: null });
      expect(await events()).toHaveLength(1);
    });

    test("a stream that fails again after recovering emits a new event", async () => {
      receiver.setStatusCode(500);
      const stream = await createStream(receiver.url);
      await seedRow(stream.id, { attempts: LAST_ATTEMPT });
      await drain(stream.id);

      receiver.setStatusCode(200);
      await seedRow(stream.id);
      await drain(stream.id);

      receiver.setStatusCode(500);
      await seedRow(stream.id, { attempts: LAST_ATTEMPT });
      await drain(stream.id);

      expect(await events()).toHaveLength(2);
    });

    test("credentials that cannot be decrypted end in a failing stream instead of stuck rows", async () => {
      const stream = await createStream(receiver.url);
      const rowId = await seedRow(stream.id, { attempts: LAST_ATTEMPT });
      decryptShouldFail = true;

      await drain(stream.id);

      expect(receiver.messages()).toHaveLength(0);
      expect(await outboxRow(rowId)).toBeUndefined();
      const health = await streamHealth(stream.id);
      expect(health?.failingSince).toBeInstanceOf(Date);
      expect(health?.lastDeliveryError).toContain("Failed to decrypt stream credentials");
      expect(await events()).toHaveLength(1);
    });
  });
});
