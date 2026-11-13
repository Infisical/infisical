import { vi } from "vitest";

import { HoneyTokenStatus, HoneyTokenType } from "./honey-token-enums";
import { HONEY_TOKEN_RESOURCE_TYPE, HONEY_TOKEN_TRIGGERED_EVENT } from "./honey-token-events";
import { honeyTokenServiceFactory } from "./honey-token-service";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const authenticateTrigger = vi.fn();
vi.mock("./honey-token-provider-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./honey-token-provider-fns")>()),
  getHoneyTokenServiceHooksByType: () => ({ aws: { authenticateTrigger } })
}));

const ACCESS_KEY_ID = "AKIADECOY0000000001";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const HONEY_TOKEN = {
  id: "honey-token-1",
  name: "prod-aws-decoy",
  type: HoneyTokenType.AWS,
  status: HoneyTokenStatus.Active,
  orgId: "org-1",
  projectId: "proj-1",
  folderId: "folder-1"
};

const buildService = () => {
  // Stands in for the honey_tokens row. A transaction restores it when its callback throws, as Postgres
  // would roll back the cooldown mark.
  const row = { lastTriggeredAt: null as Date | null };
  const transactions: object[] = [];
  const markedIn: object[] = [];
  const recordedEvents: unknown[] = [];
  const emitted: { events: { type: string; data: Record<string, unknown> }[]; tx: unknown }[] = [];
  const auditLogs: unknown[] = [];
  let failNextEmit = false;

  const honeyTokenDAL = {
    transaction: async <T>(fn: (tx: object) => Promise<T>) => {
      const tx = { id: transactions.length };
      transactions.push(tx);
      const snapshot = { ...row };
      try {
        return await fn(tx);
      } catch (err) {
        Object.assign(row, snapshot);
        throw err;
      }
    },
    tryMarkTriggered: async (accessKeyId: string, cooldownMs: number, tx: object) => {
      if (accessKeyId !== ACCESS_KEY_ID) return undefined;
      const now = new Date();
      if (row.lastTriggeredAt && now.getTime() - row.lastTriggeredAt.getTime() < cooldownMs) return undefined;
      markedIn.push(tx);
      row.lastTriggeredAt = now;
      return { ...HONEY_TOKEN, lastTriggeredAt: now };
    }
  };

  const service = honeyTokenServiceFactory({
    honeyTokenDAL,
    honeyTokenEventDAL: {
      create: async (event: unknown) => {
        recordedEvents.push(event);
        return event;
      }
    },
    eventEmitter: {
      emit: async (events: { type: string; data: Record<string, unknown> }[], tx: unknown) => {
        if (failNextEmit) {
          failNextEmit = false;
          throw new Error("outbox insert failed");
        }
        emitted.push({ events, tx });
      }
    },
    telemetryService: { sendPostHogEvents: async () => {} },
    auditLogService: {
      createAuditLog: async (log: unknown) => {
        auditLogs.push(log);
      }
    },
    projectDAL: { findById: async () => null },
    folderDAL: { findSecretPathByFolderIds: async () => [] }
  } as never);

  const trigger = (eventName = "GetCallerIdentity") => {
    const payload = {
      type: HoneyTokenType.AWS as const,
      event: {
        accessKeyId: ACCESS_KEY_ID,
        eventName,
        eventTime: "2026-11-12T10:14:58Z",
        awsRegion: "us-east-1",
        sourceIp: "203.0.113.7"
      }
    };
    return service.handleTrigger({
      type: HoneyTokenType.AWS,
      signature: `t=${Math.floor(Date.now() / 1000)},v1=signed`,
      rawBody: JSON.stringify(payload),
      payload
    });
  };

  return {
    trigger,
    row,
    markedIn,
    recordedEvents,
    emitted,
    auditLogs,
    failNextEmit: () => {
      failNextEmit = true;
    }
  };
};

describe("honey token trigger", () => {
  beforeEach(() => {
    authenticateTrigger.mockReset();
    authenticateTrigger.mockResolvedValue({
      outcome: "accepted",
      honeyToken: HONEY_TOKEN,
      telemetryProperties: { managedBy: "organization" }
    });
  });

  test("emits one alert event in the transaction that marks the token triggered", async () => {
    const harness = buildService();

    await expect(harness.trigger()).resolves.toEqual({ acknowledged: true });

    expect(harness.emitted).toHaveLength(1);
    const [{ events, tx }] = harness.emitted;
    expect(tx).toBe(harness.markedIn[0]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(HONEY_TOKEN_TRIGGERED_EVENT);
    expect(events[0].data).toMatchObject({
      orgId: "org-1",
      projectId: "proj-1",
      resourceType: HONEY_TOKEN_RESOURCE_TYPE,
      resourceId: "honey-token-1",
      targetIds: ["honey-token-1"],
      triggeredAt: harness.row.lastTriggeredAt?.toISOString(),
      eventName: "GetCallerIdentity",
      eventTime: "2026-11-12T10:14:58Z"
    });
  });

  test("a second trigger inside the cooldown is recorded but emits no second alert event", async () => {
    const harness = buildService();

    await harness.trigger();
    await expect(harness.trigger("ListBuckets")).resolves.toEqual({ acknowledged: true });

    expect(harness.recordedEvents).toHaveLength(2);
    expect(harness.emitted).toHaveLength(1);
    expect(harness.auditLogs).toHaveLength(1);
  });

  test("after a reset the next trigger emits again", async () => {
    const harness = buildService();

    await harness.trigger();
    harness.row.lastTriggeredAt = null;
    await harness.trigger();

    expect(harness.emitted).toHaveLength(2);
  });

  test("a trigger after the cooldown has passed emits again", async () => {
    const harness = buildService();

    await harness.trigger();
    harness.row.lastTriggeredAt = new Date(Date.now() - COOLDOWN_MS - 1000);
    await harness.trigger();

    expect(harness.emitted).toHaveLength(2);
  });

  test("a failed event insert fails the trigger and rolls back the cooldown mark", async () => {
    const harness = buildService();

    harness.failNextEmit();
    await expect(harness.trigger()).rejects.toThrow("outbox insert failed");
    expect(harness.row.lastTriggeredAt).toBeNull();
    expect(harness.auditLogs).toHaveLength(0);

    // AWS retries a failed delivery, and the retry must still alert rather than land inside a cooldown
    // that no alert event was ever written for.
    await harness.trigger();
    expect(harness.emitted).toHaveLength(1);
  });

  test("a revoked token's trigger is acknowledged without recording or emitting anything", async () => {
    authenticateTrigger.mockResolvedValue({
      outcome: "accepted",
      honeyToken: { ...HONEY_TOKEN, status: HoneyTokenStatus.Revoked },
      telemetryProperties: { managedBy: "organization" }
    });
    const harness = buildService();

    await expect(harness.trigger()).resolves.toEqual({ acknowledged: true });

    expect(harness.recordedEvents).toHaveLength(0);
    expect(harness.emitted).toHaveLength(0);
    expect(harness.row.lastTriggeredAt).toBeNull();
  });
});
