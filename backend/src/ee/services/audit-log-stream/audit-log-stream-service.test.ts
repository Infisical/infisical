import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { KeyStorePrefixes } from "@app/keystore/keystore";

import { auditLogStreamServiceFactory } from "./audit-log-stream-service";

const FAILURE_THRESHOLD = 20;
const STREAM_ID = "stream-1";
const ORG_ID = "org-1";
const PROVIDER = "datadog";

const FAILURE_MESSAGE = "upstream failure";
const failingProviderStreamLog = vi.fn(async () => {
  throw new Error(FAILURE_MESSAGE);
});

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

// Override the factory map so every provider lookup returns a streamLog that rejects.
vi.mock("./audit-log-stream-factory", () => ({
  LOG_STREAM_FACTORY_MAP: new Proxy(
    {},
    {
      get: () => () => ({
        streamLog: failingProviderStreamLog,
        validateCredentials: async ({ credentials }: { credentials: unknown }) => credentials
      })
    }
  )
}));

vi.mock("@app/ee/services/audit-log-stream/audit-log-stream-fns", () => ({
  decryptLogStream: async (s: unknown) => s,
  decryptLogStreamCredentials: async () => ({}),
  encryptLogStreamCredentials: async () => "encrypted",
  listProviderOptions: () => []
}));

const createService = () => {
  const store: Record<string, string | undefined> = {};

  const keyStore = {
    getItem: vi.fn(async (key: string) => store[key] ?? null),
    setItemWithExpiryNX: vi.fn(async (key: string, _ttl: number, value: string) => {
      if (store[key] !== undefined) return null;
      store[key] = value;
      return "OK";
    }),
    deleteItem: vi.fn(async (key: string) => {
      const existed = store[key] !== undefined;
      delete store[key];
      return existed ? 1 : 0;
    }),
    deleteItemsByKeyIn: vi.fn(async (keys: string[]) => {
      let deleted = 0;
      for (const k of keys) {
        if (store[k] !== undefined) {
          delete store[k];
          deleted += 1;
        }
      }
      return deleted;
    }),
    incrementByWithExpiry: vi.fn(async (key: string, value: number) => {
      const current = store[key] ? parseInt(store[key] as string, 10) : 0;
      const next = current + value;
      store[key] = String(next);
      return next;
    })
  };

  const auditLogStreamDAL = {
    find: vi.fn(async () => [
      {
        id: STREAM_ID,
        provider: PROVIDER,
        encryptedCredentials: Buffer.from("x"),
        orgId: ORG_ID
      }
    ])
  };

  const notificationService = {
    createUserNotifications: vi.fn(async () => undefined)
  };
  const smtpService = {
    sendMail: vi.fn<
      (payload: { substitutions: { lastErrorMessage: string; lastErrorTimestamp: string } }) => Promise<void>
    >(async () => undefined)
  };
  const orgDAL = {
    findOrgMembersByRole: vi.fn(async () => [
      { status: "accepted", user: { id: "user-1", email: "admin@example.com" } }
    ])
  };

  const service = auditLogStreamServiceFactory({
    auditLogStreamDAL: auditLogStreamDAL as never,
    permissionService: {} as never,
    licenseService: {} as never,
    kmsService: {} as never,
    keyStore: keyStore as never,
    notificationService: notificationService as never,
    smtpService: smtpService as never,
    orgDAL: orgDAL as never
  });

  return { service, keyStore, auditLogStreamDAL, notificationService, smtpService, orgDAL, store };
};

const driveFailures = async (service: ReturnType<typeof createService>["service"], times: number) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await service.streamLog(ORG_ID, { id: `log-${i}` } as never);
  }
};

describe("auditLogStreamServiceFactory failure tracking", () => {
  beforeEach(() => {
    failingProviderStreamLog.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("does not fire an alert below the failure threshold", async () => {
    const { service, notificationService, smtpService, keyStore } = createService();

    await driveFailures(service, FAILURE_THRESHOLD - 1);

    expect(notificationService.createUserNotifications).not.toHaveBeenCalled();
    expect(smtpService.sendMail).not.toHaveBeenCalled();
    expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
  });

  test("fires an alert exactly once when the threshold is reached", async () => {
    const { service, notificationService, smtpService } = createService();

    await driveFailures(service, FAILURE_THRESHOLD);

    expect(notificationService.createUserNotifications).toHaveBeenCalledTimes(1);
    expect(smtpService.sendMail).toHaveBeenCalledTimes(1);

    expect(notificationService.createUserNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "user-1",
        orgId: ORG_ID,
        type: "audit-log-stream-failed"
      })
    ]);
  });

  test("does not re-fire while the cooldown lock is held", async () => {
    const { service, notificationService } = createService();

    await driveFailures(service, FAILURE_THRESHOLD);
    expect(notificationService.createUserNotifications).toHaveBeenCalledTimes(1);

    await driveFailures(service, FAILURE_THRESHOLD * 2);
    expect(notificationService.createUserNotifications).toHaveBeenCalledTimes(1);
  });

  test("releases the cooldown lock when notification delivery throws", async () => {
    const { service, keyStore, notificationService } = createService();
    notificationService.createUserNotifications.mockRejectedValueOnce(new Error("downstream"));

    await driveFailures(service, FAILURE_THRESHOLD);

    expect(keyStore.deleteItem).toHaveBeenCalledWith(KeyStorePrefixes.AuditLogStreamAlertSent(STREAM_ID));
  });

  test("skips alerting orgs with no active admins", async () => {
    const { service, orgDAL, notificationService, smtpService } = createService();
    orgDAL.findOrgMembersByRole.mockResolvedValueOnce([
      { status: "invited", user: { id: "user-1", email: "admin@example.com" } }
    ]);

    await driveFailures(service, FAILURE_THRESHOLD);

    expect(notificationService.createUserNotifications).not.toHaveBeenCalled();
    expect(smtpService.sendMail).not.toHaveBeenCalled();
  });

  test("honors a preset cooldown lock and skips alert evaluation entirely", async () => {
    const { service, keyStore, store, notificationService } = createService();
    store[KeyStorePrefixes.AuditLogStreamAlertSent(STREAM_ID)] = "1";

    await driveFailures(service, FAILURE_THRESHOLD * 2);

    expect(keyStore.incrementByWithExpiry).not.toHaveBeenCalled();
    expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
    expect(notificationService.createUserNotifications).not.toHaveBeenCalled();
  });

  test("stores the last error message and timestamp in the cooldown payload", async () => {
    const { service, store, smtpService } = createService();

    await driveFailures(service, FAILURE_THRESHOLD);

    const payload = store[KeyStorePrefixes.AuditLogStreamAlertSent(STREAM_ID)];
    expect(payload).toBeDefined();
    const parsed = JSON.parse(payload as string) as { message: string; timestamp: string };
    expect(parsed.message).toContain(FAILURE_MESSAGE);
    expect(typeof parsed.timestamp).toBe("string");
    expect(Number.isNaN(new Date(parsed.timestamp).getTime())).toBe(false);

    expect(smtpService.sendMail).toHaveBeenCalledTimes(1);
    const mailCall = smtpService.sendMail.mock.calls[0]?.[0] as {
      substitutions: { lastErrorMessage: string; lastErrorTimestamp: string };
    };
    expect(mailCall.substitutions.lastErrorMessage).toContain(FAILURE_MESSAGE);
    expect(mailCall.substitutions.lastErrorTimestamp).toBe(parsed.timestamp);
  });
});
