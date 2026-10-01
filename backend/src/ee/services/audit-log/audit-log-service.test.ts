import { beforeEach, describe, expect, test, vi } from "vitest";

import { QueueJobs, QueueName } from "@app/queue";

import { AuditLogEventClass } from "./audit-log-event-classes";
import { auditLogServiceFactory } from "./audit-log-service";
import { TEffectiveAuditLogSettings } from "./audit-log-settings-types";
import { EventType, TRecordPermissionDeniedDTO } from "./audit-log-types";

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ DISABLE_AUDIT_LOG_GENERATION: false })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

type TFlushPayload = { collapseKey: string; windowStart: string; windowEnd: string; orgId: string };
type TPushedLog = { event: { metadata: Record<string, unknown> } };

const denial = (overrides: Partial<TRecordPermissionDeniedDTO> = {}): TRecordPermissionDeniedDTO => ({
  orgId: "org-1",
  projectId: "project-1",
  actor: { type: "identity", metadata: { identityId: "identity-1", name: "ci" } } as never,
  ipAddress: "127.0.0.1",
  userAgent: "test",
  userAgentType: "other" as never,
  metadata: {
    permissionAction: "create",
    permissionSubject: "secrets",
    errorName: "ForbiddenError",
    route: "/api/v3/secrets/raw/:secretName",
    method: "POST"
  },
  ...overrides
});

const createHarness = ({ windowAcquired = true, storedCount = "0", retentionDays = 30 } = {}) => {
  const startHandlers = new Map<string, (job: { data: unknown }) => Promise<void>>();
  const queueService = {
    start: vi.fn((name: string, fn: (job: { data: unknown }) => Promise<void>) => {
      startHandlers.set(name, fn);
    }),
    queue: vi.fn<
      (name: string, job: string, data: TFlushPayload, opts: { jobId: string; delay: number }) => Promise<void>
    >(async () => undefined)
  };
  const keyStore = {
    getItem: vi.fn<(key: string) => Promise<string | null>>(async () => storedCount),
    setItemWithExpiry: vi.fn(async () => "OK"),
    setItemWithExpiryNX: vi.fn<(key: string, ttl: number, value: string) => Promise<string | null>>(async () =>
      windowAcquired ? "OK" : null
    ),
    incrementByWithExpiry: vi.fn<(key: string, by: number, ttl: number) => Promise<number>>(async () => 1),
    deleteItem: vi.fn<(key: string) => Promise<number>>(async () => 1)
  };
  const auditLogQueue = { pushToLog: vi.fn<(data: TPushedLog) => Promise<void>>(async () => undefined) };
  const licenseService = { getPlan: vi.fn(async () => ({ auditLogsRetentionDays: retentionDays })) };
  const auditLogSettingsService = {
    getEffectiveSettings: vi.fn<(orgId: string) => Promise<TEffectiveAuditLogSettings>>(async () => ({
      org: {},
      projects: { "project-1": { [AuditLogEventClass.Authorization]: true } },
      shouldUseNewPrivilegeSystem: true
    }))
  };

  const service = auditLogServiceFactory({
    auditLogDAL: {} as never,
    permissionService: {} as never,
    auditLogQueue: auditLogQueue as never,
    auditLogSettingsService: auditLogSettingsService as never,
    licenseService: licenseService as never,
    queueService: queueService as never,
    keyStore: keyStore as never,
    smtpService: {} as never,
    userDAL: {} as never,
    notificationService: {} as never
  });

  const flush = startHandlers.get(QueueName.AuditLogCollapsedFlush);
  if (!flush) throw new Error("flush worker was not registered");

  return { service, queueService, keyStore, auditLogQueue, auditLogSettingsService, flush };
};

describe("recordPermissionDenied", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("first denial in a window is written and schedules the flush job", async () => {
    const { service, queueService, keyStore, auditLogQueue } = createHarness();

    await service.recordPermissionDenied(denial());

    expect(keyStore.incrementByWithExpiry).not.toHaveBeenCalled();
    expect(auditLogQueue.pushToLog).toHaveBeenCalledTimes(1);
    expect(auditLogQueue.pushToLog.mock.calls[0][0]).toMatchObject({
      orgId: "org-1",
      projectId: "project-1",
      event: { type: EventType.PERMISSION_DENIED, metadata: { permissionAction: "create", method: "POST" } }
    });
    expect(auditLogQueue.pushToLog.mock.calls[0][0].event.metadata).not.toHaveProperty("suppressedRepeats");

    expect(queueService.queue).toHaveBeenCalledTimes(1);
    const [queueName, jobName, payload, opts] = queueService.queue.mock.calls[0];
    expect(queueName).toBe(QueueName.AuditLogCollapsedFlush);
    expect(jobName).toBe(QueueJobs.AuditLogCollapsedFlush);
    expect(opts.delay).toBe(62_000);
    expect(opts.jobId).toContain(payload.collapseKey);
    expect(payload.orgId).toBe("org-1");
    expect(new Date(payload.windowEnd).getTime() - new Date(payload.windowStart).getTime()).toBe(60_000);
    expect(keyStore.setItemWithExpiryNX.mock.calls[0][0]).toContain(payload.collapseKey);
    expect(keyStore.setItemWithExpiryNX.mock.calls[0][2]).toBe(payload.windowStart);
  });

  test("a repeat inside the window only bumps that window's counter", async () => {
    const openWindowStart = "2026-09-30T10:00:00.000Z";
    const { service, queueService, keyStore, auditLogQueue } = createHarness({
      windowAcquired: false,
      storedCount: openWindowStart
    });

    await service.recordPermissionDenied(denial());

    expect(auditLogQueue.pushToLog).not.toHaveBeenCalled();
    expect(queueService.queue).not.toHaveBeenCalled();
    expect(keyStore.incrementByWithExpiry).toHaveBeenCalledTimes(1);
    expect(keyStore.incrementByWithExpiry.mock.calls[0][0]).toContain(openWindowStart);
  });

  test("a repeat that finds the window already closed opens the next one", async () => {
    const { service, queueService, keyStore, auditLogQueue } = createHarness({ windowAcquired: false });
    keyStore.getItem.mockResolvedValueOnce(null);
    keyStore.setItemWithExpiryNX.mockResolvedValueOnce(null).mockResolvedValueOnce("OK");

    await service.recordPermissionDenied(denial());

    expect(keyStore.incrementByWithExpiry).not.toHaveBeenCalled();
    expect(auditLogQueue.pushToLog).toHaveBeenCalledTimes(1);
    expect(queueService.queue).toHaveBeenCalledTimes(1);
  });

  test("a repeat that loses the race twice is recorded instead of dropped", async () => {
    const { service, queueService, keyStore, auditLogQueue } = createHarness({ windowAcquired: false });
    keyStore.getItem.mockResolvedValue(null);

    await service.recordPermissionDenied(denial());

    expect(keyStore.setItemWithExpiryNX).toHaveBeenCalledTimes(2);
    expect(keyStore.incrementByWithExpiry).not.toHaveBeenCalled();
    expect(auditLogQueue.pushToLog).toHaveBeenCalledTimes(1);
    expect(queueService.queue).not.toHaveBeenCalled();
  });

  test("the method is part of the collapse key", async () => {
    const { service, keyStore } = createHarness();

    await service.recordPermissionDenied(denial({ metadata: { ...denial().metadata, method: "GET" } }));
    await service.recordPermissionDenied(denial({ metadata: { ...denial().metadata, method: "DELETE" } }));

    const [firstKey] = keyStore.setItemWithExpiryNX.mock.calls[0];
    const [secondKey] = keyStore.setItemWithExpiryNX.mock.calls[1];
    expect(firstKey).not.toBe(secondKey);
  });

  test("nothing is recorded when the authorization class is off", async () => {
    const { service, keyStore, auditLogQueue, auditLogSettingsService } = createHarness();
    auditLogSettingsService.getEffectiveSettings.mockResolvedValueOnce({
      org: {},
      projects: { "project-1": { [AuditLogEventClass.Authorization]: false } },
      shouldUseNewPrivilegeSystem: true
    });

    await service.recordPermissionDenied(denial());

    expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
    expect(auditLogQueue.pushToLog).not.toHaveBeenCalled();
  });

  test("nothing is recorded when the plan has no audit log retention", async () => {
    const { service, keyStore, queueService, auditLogQueue } = createHarness({ retentionDays: 0 });

    await service.recordPermissionDenied(denial());

    expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
    expect(queueService.queue).not.toHaveBeenCalled();
    expect(auditLogQueue.pushToLog).not.toHaveBeenCalled();
  });

  test("a keystore failure is swallowed", async () => {
    const { service, keyStore, auditLogQueue } = createHarness();
    keyStore.setItemWithExpiryNX.mockRejectedValueOnce(new Error("redis down"));

    await expect(service.recordPermissionDenied(denial())).resolves.toBeUndefined();
    expect(auditLogQueue.pushToLog).not.toHaveBeenCalled();
  });
});

describe("createCollapsedAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const { metadata, ...auditLogInfo } = denial();
  const collapsed = (type: EventType) => ({
    ...auditLogInfo,
    event: { type, metadata } as never,
    collapseKeyParts: ["org-1", "identity-1"]
  });

  test("the event type is part of the collapse key", async () => {
    const { service, keyStore } = createHarness();

    await service.createCollapsedAuditLog(collapsed(EventType.PERMISSION_DENIED));
    await service.createCollapsedAuditLog(collapsed(EventType.GET_SECRETS));

    const [firstKey] = keyStore.setItemWithExpiryNX.mock.calls[0];
    const [secondKey] = keyStore.setItemWithExpiryNX.mock.calls[1];
    expect(firstKey).not.toBe(secondKey);
  });

  test("a custom window sets the key ttl and the job delay", async () => {
    const { service, keyStore, queueService } = createHarness();

    await service.createCollapsedAuditLog({ ...collapsed(EventType.GET_SECRETS), collapseWindowSeconds: 300 });

    expect(keyStore.setItemWithExpiryNX.mock.calls[0][1]).toBe(300);
    expect(queueService.queue.mock.calls[0][3].delay).toBe(302_000);
  });
});

describe("collapsed audit log flush job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const { metadata, ...auditLogInfo } = denial();
  const jobData = {
    ...auditLogInfo,
    event: { type: EventType.PERMISSION_DENIED, metadata } as never,
    collapseKey: "abc",
    windowStart: "2026-09-30T10:00:00.000Z",
    windowEnd: "2026-09-30T10:01:00.000Z"
  };

  test("writes one summary event carrying the repeat count and window", async () => {
    const { flush, keyStore, auditLogQueue } = createHarness({ storedCount: "41" });

    await flush({ data: jobData });

    expect(keyStore.getItem).toHaveBeenCalledTimes(1);
    expect(keyStore.getItem.mock.calls[0][0]).toContain(jobData.collapseKey);
    expect(keyStore.getItem.mock.calls[0][0]).toContain(jobData.windowStart);
    expect(keyStore.deleteItem).not.toHaveBeenCalled();
    expect(auditLogQueue.pushToLog).toHaveBeenCalledTimes(1);
    expect(auditLogQueue.pushToLog.mock.calls[0][0]).toMatchObject({
      orgId: "org-1",
      projectId: "project-1",
      actor: { type: "identity", metadata: { identityId: "identity-1" } },
      event: {
        type: EventType.PERMISSION_DENIED,
        metadata: {
          permissionAction: "create",
          suppressedRepeats: 41,
          suppressedFrom: "2026-09-30T10:00:00.000Z",
          suppressedUntil: "2026-09-30T10:01:00.000Z"
        }
      }
    });
  });

  test("writes nothing when no repeat was counted", async () => {
    const { flush, auditLogQueue } = createHarness({ storedCount: "0" });

    await flush({ data: jobData });

    expect(auditLogQueue.pushToLog).not.toHaveBeenCalled();
  });
});
