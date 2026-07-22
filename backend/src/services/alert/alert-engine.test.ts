import { z } from "zod";

import { TAlertPayload } from "./alert-channel-types";
import { alertEngineFactory, TAlertEngineDep } from "./alert-engine";
import { alertProviderRegistryFactory } from "./alert-provider-registry";
import { AlertPrincipalType, AlertRunStatus, IResourceAlertProvider, TAlertContext } from "./alert-types";

// logger is `export let logger` assigned by initLogger(), which unit tests don't run, so any
// channel-failure path (which logs) would otherwise dereference undefined. Mock it per-file.
vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

// Stub outbound HTTP so PagerDuty/Slack/webhook sends resolve without a real network call.
vi.mock("@app/lib/validator", async (importActual) => ({
  ...(await importActual<typeof import("@app/lib/validator")>()),
  safeRequest: { post: async () => ({ data: {} }) }
}));

type TTarget = { id: string };

const RESOURCE_TYPE = "test.resource";

const makeAlert = () => ({
  id: "alert-1",
  name: "test-alert",
  description: null,
  resourceType: RESOURCE_TYPE,
  resourceId: null,
  eventType: "test.resource.expiration",
  triggerType: "scheduled",
  condition: { alertBefore: "30d" },
  enabled: true,
  orgId: "org-1",
  projectId: null,
  createdByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date()
});

const makeProvider = (targets: TTarget[]): IResourceAlertProvider<TTarget> => ({
  resourceType: RESOURCE_TYPE,
  eventTypes: ["test.resource.expiration"],
  conditionSchema: z.any(),
  findDueTargets: async () => targets,
  assertPermission: async () => undefined,
  assertResourceInScope: async () => undefined,
  targetId: (target) => target.id,
  buildViewUrl: async () => "https://app.infisical.com/x",
  buildPayload: (_alert: TAlertContext, matched: TTarget[], viewUrl: string): TAlertPayload => ({
    alert: {
      id: "alert-1",
      name: "test-alert",
      orgId: "org-1",
      resourceType: RESOURCE_TYPE,
      viewUrl
    },
    eventKey: "test.resource.expiration",
    eventLabel: "Expiration",
    webhookType: "com.infisical.test.resource.expiration",
    resourceKind: "Test Resource",
    severity: "warning",
    summary: `${matched.length} expiring`,
    items: matched.map((target) => ({ id: target.id, title: target.id }))
  })
});

// A KMS mock whose decryptor is the identity function, so encryptedConfig is just JSON bytes.
const kmsServiceMock = {
  createCipherPairWithDataKey: async () => ({
    encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
    decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
  })
};

const encConfig = (config: unknown) => Buffer.from(JSON.stringify(config));

type TDelivery = { targetId: string; channelId: string; channelType: string; status: string };

const buildEngine = (opts: {
  targets: TTarget[];
  channels: Array<{ id: string; channelType: string; encryptedConfig: Buffer; enabled: boolean }>;
  recentlyAlerted?: Array<{ channelId: string; targetId: string }>;
  recipients?: Array<{ userId: string; email: string; firstName?: string | null }>;
  failEmail?: boolean;
  failEmailFor?: string;
}) => {
  const registry = alertProviderRegistryFactory();
  registry.register(makeProvider(opts.targets) as IResourceAlertProvider);

  const sentMail: Array<{ recipients: string[] }> = [];
  const historyWrites: Array<{ deliveries: TDelivery[]; status: string }> = [];

  const engine = alertEngineFactory({
    alertChannelDAL: {
      findByAlertId: async (_alertId: string, filter?: { enabled?: boolean }) =>
        filter?.enabled === undefined ? opts.channels : opts.channels.filter((c) => c.enabled === filter.enabled)
    },
    alertChannelRecipientDAL: {
      // One recipient row per directed channel in the run, so each resolves its own list.
      findByChannelIds: async (channelIds: string[]) =>
        channelIds.map((channelId) => ({
          id: `r-${channelId}`,
          channelId,
          principalType: AlertPrincipalType.USER,
          principalId: "u1",
          createdAt: new Date(),
          updatedAt: new Date()
        }))
    },
    alertHistoryDAL: {
      findRecentlyAlertedTargets: async () => opts.recentlyAlerted ?? [],
      createWithTargets: async (_alertId: string, options: { status: string }, deliveries: TDelivery[]) => {
        historyWrites.push({ deliveries, status: options.status });
        return {} as never;
      }
    },
    alertProviderRegistry: registry,
    alertRecipientResolver: {
      resolveMany: async (rowsByChannel: Map<string, unknown[]>) => {
        const resolved = opts.recipients ?? [{ userId: "u1", email: "user@example.com", firstName: "U" }];
        return new Map([...rowsByChannel.keys()].map((channelId) => [channelId, resolved]));
      }
    },
    kmsService: kmsServiceMock,
    smtpService: {
      sendMail: async (opt: { recipients: string[] }) => {
        if (opts.failEmail) throw new Error("smtp down");
        if (opts.failEmailFor && opt.recipients.includes(opts.failEmailFor)) throw new Error("mailbox unavailable");
        sentMail.push({ recipients: opt.recipients });
      }
    }
  } as unknown as TAlertEngineDep);

  return { engine, sentMail, historyWrites };
};

describe("alert engine", () => {
  test("dispatches email to resolved recipients and records a delivery per (target, channel)", async () => {
    const { engine, sentMail, historyWrites } = buildEngine({
      targets: [{ id: "t1" }, { id: "t2" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }]
    });

    await engine.runAlert(makeAlert());

    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].recipients).toEqual(["user@example.com"]);
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].status).toBe(AlertRunStatus.SUCCESS);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email", channelType: "email", status: AlertRunStatus.SUCCESS },
      { targetId: "t2", channelId: "c-email", channelType: "email", status: AlertRunStatus.SUCCESS }
    ]);
  });

  test("dedups a target already delivered on the same channel within the window", async () => {
    const { engine, historyWrites } = buildEngine({
      targets: [{ id: "t1" }, { id: "t2" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }],
      recentlyAlerted: [{ channelId: "c-email", targetId: "t1" }]
    });

    await engine.runAlert(makeAlert());

    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].deliveries.map((d) => d.targetId)).toEqual(["t2"]);
  });

  test("re-fires a target on a channel that has not delivered it, even if another channel has", async () => {
    const { engine, sentMail, historyWrites } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [
        { id: "c-email-1", channelType: "email", encryptedConfig: encConfig({}), enabled: true },
        { id: "c-email-2", channelType: "email", encryptedConfig: encConfig({}), enabled: true }
      ],
      // t1 was delivered on channel 1 but never on channel 2 → only channel 2 should fire.
      recentlyAlerted: [{ channelId: "c-email-1", targetId: "t1" }]
    });

    await engine.runAlert(makeAlert());

    expect(sentMail).toHaveLength(1);
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email-2", channelType: "email", status: AlertRunStatus.SUCCESS }
    ]);
  });

  test("records FAILED deliveries when a channel fails so they are re-tried next run", async () => {
    const { engine, sentMail, historyWrites } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }],
      failEmail: true
    });

    await engine.runAlert(makeAlert());

    expect(sentMail).toHaveLength(0);
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].status).toBe(AlertRunStatus.FAILED);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email", channelType: "email", status: AlertRunStatus.FAILED }
    ]);
  });

  test("marks a directed channel SUCCESS when at least one recipient delivers, so healthy recipients are not re-spammed", async () => {
    const { engine, sentMail, historyWrites } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }],
      recipients: [
        { userId: "u1", email: "good@example.com" },
        { userId: "u2", email: "dead@example.com" }
      ],
      failEmailFor: "dead@example.com"
    });

    await engine.runAlert(makeAlert());

    // The healthy recipient still got the mail.
    expect(sentMail.flatMap((m) => m.recipients)).toEqual(["good@example.com"]);
    // The target is recorded SUCCESS despite the one bounce, so it won't re-fire (and re-spam the
    // healthy recipient) on the next run.
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email", channelType: "email", status: AlertRunStatus.SUCCESS }
    ]);
  });

  test("fails a directed channel with no resolved recipients instead of dispatching to undefined", async () => {
    const { engine, sentMail, historyWrites } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }],
      recipients: [] // group emptied / user deleted at runtime
    });

    await engine.runAlert(makeAlert());

    // No send is attempted with an undefined recipient.
    expect(sentMail).toHaveLength(0);
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].status).toBe(AlertRunStatus.FAILED);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email", channelType: "email", status: AlertRunStatus.FAILED }
    ]);
  });

  test("caps a per-target channel (PagerDuty) at maxTargetsPerRun and defers the rest instead of marking them delivered", async () => {
    const { engine, historyWrites } = buildEngine({
      targets: Array.from({ length: 15 }, (_, i) => ({ id: `t${i}` })),
      channels: [
        {
          id: "c-pd",
          channelType: "pagerduty",
          encryptedConfig: encConfig({ integrationKey: "a".repeat(32) }),
          enabled: true
        }
      ]
    });

    await engine.runAlert(makeAlert());

    expect(historyWrites).toHaveLength(1);
    // Only the first 10 targets are dispatched and recorded; the other 5 get no history row, so they
    // are re-evaluated and paged on the next run rather than being silently marked delivered.
    expect(historyWrites[0].deliveries).toHaveLength(10);
    expect(historyWrites[0].deliveries.map((d) => d.targetId)).toEqual(Array.from({ length: 10 }, (_, i) => `t${i}`));
    expect(historyWrites[0].deliveries.every((d) => d.status === AlertRunStatus.SUCCESS)).toBe(true);
  });

  test("pages the deferred targets on a later run once the first batch is deduped", async () => {
    const { engine, historyWrites } = buildEngine({
      targets: Array.from({ length: 15 }, (_, i) => ({ id: `t${i}` })),
      channels: [
        {
          id: "c-pd",
          channelType: "pagerduty",
          encryptedConfig: encConfig({ integrationKey: "a".repeat(32) }),
          enabled: true
        }
      ],
      // First 10 already delivered on the previous run.
      recentlyAlerted: Array.from({ length: 10 }, (_, i) => ({ channelId: "c-pd", targetId: `t${i}` }))
    });

    await engine.runAlert(makeAlert());

    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].deliveries.map((d) => d.targetId)).toEqual(["t10", "t11", "t12", "t13", "t14"]);
  });

  test("skips entirely when every channel already delivered every target", async () => {
    const { engine, historyWrites, sentMail } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }],
      recentlyAlerted: [{ channelId: "c-email", targetId: "t1" }]
    });

    await engine.runAlert(makeAlert());

    expect(sentMail).toHaveLength(0);
    expect(historyWrites).toHaveLength(0);
  });

  test("writes no history when there are no enabled channels", async () => {
    const { engine, historyWrites } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: false }]
    });

    await engine.runAlert(makeAlert());

    expect(historyWrites).toHaveLength(0);
  });
});
