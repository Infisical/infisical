import { QueueName } from "@app/queue";

import { pkiAlertV2QueueServiceFactory } from "./pki-alert-v2-queue";
import { PkiAlertEventType } from "./pki-alert-v2-types";

vi.mock("@app/lib/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  },
  initLogger: () => {}
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ isSecondaryInstance: false })
}));

type TEventPayload = {
  certificateId: string;
  projectId: string;
  eventType: PkiAlertEventType;
  applicationId?: string | null;
};

type TEventHandler = (job: { data: TEventPayload }) => Promise<void>;
type TSendEventNotifications = (
  alertId: string,
  certificateIds: string[],
  eventType: PkiAlertEventType
) => Promise<{ sent: boolean; reason?: string }>;

const PRIMARY = { __primary: true };

const buildQueue = (opts: {
  alerts: { id: string; name: string; applicationId?: string | null }[];
  sendEventNotifications?: TSendEventNotifications;
}) => {
  const queued: { name: string; data: unknown; jobId?: string }[] = [];
  const findByProjectIdCalls: unknown[][] = [];
  const sendCalls: unknown[][] = [];
  let eventHandler: TEventHandler | undefined;

  const factory = pkiAlertV2QueueServiceFactory({
    queueService: {
      queue: async (name: string, _job: string, data: unknown, options: { jobId?: string }) => {
        queued.push({ name, data, jobId: options.jobId });
      },
      start: (_name: string, handler: TEventHandler) => {
        eventHandler = handler;
      }
    } as never,
    cronJob: { register: () => {} } as never,
    pkiAlertV2Service: {
      sendAlertNotifications: async () => {},
      sendEventNotifications: async (alertId: string, certificateIds: string[], eventType: PkiAlertEventType) => {
        sendCalls.push([alertId, certificateIds, eventType]);
        if (opts.sendEventNotifications) return opts.sendEventNotifications(alertId, certificateIds, eventType);
        return { sent: true };
      }
    } as never,
    pkiAlertV2DAL: {
      findByProjectId: async (...args: unknown[]) => {
        findByProjectIdCalls.push(args);
        return opts.alerts;
      },
      findMatchingCertificates: async () => ({ certificates: [], total: 0 }),
      getDistinctProjectIds: async () => [],
      primaryNode: () => PRIMARY
    } as never,
    pkiAlertHistoryDAL: { findRecentlyAlertedCertificates: async () => [] } as never
  });

  factory.init();
  if (!eventHandler) throw new Error("event handler was not registered");

  return { factory, queued, findByProjectIdCalls, sendCalls, eventHandler };
};

const payload: TEventPayload = {
  certificateId: "cert-1",
  projectId: "project-1",
  eventType: PkiAlertEventType.ISSUANCE,
  applicationId: null
};

describe("pkiAlertV2Queue event processing", () => {
  it("queues the event with a job id derived from the certificate id", async () => {
    const { factory, queued } = buildQueue({ alerts: [] });

    await factory.queueCertificateEvent(payload);

    expect(queued).toHaveLength(1);
    expect(queued[0].name).toBe(QueueName.PkiAlertV2Event);
    expect(queued[0].jobId).toBe("pki-alert-event-project-1-cert-1-issuance");
    expect(queued[0].data).toEqual(payload);
  });

  it("reads matching alerts from the primary node", async () => {
    const { eventHandler, findByProjectIdCalls } = buildQueue({ alerts: [] });

    await eventHandler({ data: payload });

    expect(findByProjectIdCalls).toHaveLength(1);
    expect(findByProjectIdCalls[0][0]).toBe("project-1");
    expect(findByProjectIdCalls[0][1]).toEqual({ eventType: PkiAlertEventType.ISSUANCE, enabled: true });
    expect(findByProjectIdCalls[0][2]).toBe(PRIMARY);
  });

  it("dispatches the event certificate id to every project-wide alert", async () => {
    const { eventHandler, sendCalls } = buildQueue({
      alerts: [
        { id: "alert-1", name: "all", applicationId: null },
        { id: "alert-2", name: "also-all" }
      ]
    });

    await eventHandler({ data: payload });

    expect(sendCalls).toEqual([
      ["alert-1", ["cert-1"], PkiAlertEventType.ISSUANCE],
      ["alert-2", ["cert-1"], PkiAlertEventType.ISSUANCE]
    ]);
  });

  it("only dispatches application-scoped alerts for events in that application", async () => {
    const { eventHandler, sendCalls } = buildQueue({
      alerts: [
        { id: "alert-app-a", name: "a", applicationId: "app-a" },
        { id: "alert-app-b", name: "b", applicationId: "app-b" },
        { id: "alert-global", name: "g", applicationId: null }
      ]
    });

    await eventHandler({ data: { ...payload, applicationId: "app-a" } });

    expect(sendCalls.map((c) => c[0])).toEqual(["alert-app-a", "alert-global"]);
  });

  it("continues with the remaining alerts when one alert throws", async () => {
    const { eventHandler, sendCalls } = buildQueue({
      alerts: [
        { id: "alert-1", name: "one" },
        { id: "alert-2", name: "two" }
      ],
      sendEventNotifications: async (alertId) => {
        if (alertId === "alert-1") throw new Error("boom");
        return { sent: true };
      }
    });

    await expect(eventHandler({ data: payload })).resolves.toBeUndefined();
    expect(sendCalls.map((c) => c[0])).toEqual(["alert-1", "alert-2"]);
  });
});
