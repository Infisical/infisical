import { z } from "zod";

import { TAlarmPayload } from "./alarm-channel-types";
import { alarmEngineFactory, TAlarmEngineDep } from "./alarm-engine";
import { alarmProviderRegistryFactory } from "./alarm-provider-registry";
import { AlarmPrincipalType, AlarmRunStatus, IResourceAlarmProvider, TAlarmContext } from "./alarm-types";

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

const makeAlarm = () => ({
  id: "alarm-1",
  name: "test-alarm",
  description: null,
  resourceType: RESOURCE_TYPE,
  resourceId: null,
  eventType: "test.resource.expiration",
  condition: { alertBefore: "30d" },
  filters: null,
  enabled: true,
  orgId: "org-1",
  projectId: null,
  createdByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date()
});

const makeProvider = (targets: TTarget[]): IResourceAlarmProvider<TTarget> => ({
  resourceType: RESOURCE_TYPE,
  eventTypes: ["test.resource.expiration"],
  conditionSchema: z.any(),
  findDueTargets: async () => targets,
  assertPermission: async () => undefined,
  assertResourceInScope: async () => undefined,
  targetId: (target) => target.id,
  buildPayload: (_alarm: TAlarmContext, matched: TTarget[]): TAlarmPayload => ({
    alarm: {
      id: "alarm-1",
      name: "test-alarm",
      orgId: "org-1",
      resourceType: RESOURCE_TYPE,
      viewUrl: "https://app.infisical.com/x"
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
  recentlyAlarmed?: Array<{ channelId: string; targetId: string }>;
  recipients?: Array<{ userId: string; email: string; firstName?: string | null }>;
  failEmail?: boolean;
  failEmailFor?: string;
}) => {
  const registry = alarmProviderRegistryFactory();
  registry.register(makeProvider(opts.targets) as IResourceAlarmProvider);

  const sentMail: Array<{ recipients: string[] }> = [];
  const createdNotifications: unknown[][] = [];
  const historyWrites: Array<{ deliveries: TDelivery[]; status: string }> = [];

  const engine = alarmEngineFactory({
    alarmChannelDAL: { findByAlarmId: async () => opts.channels },
    alarmRecipientDAL: {
      findByAlarmId: async () => [
        {
          id: "r1",
          alarmId: "alarm-1",
          principalType: AlarmPrincipalType.USER,
          principalId: "u1",
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    },
    alarmHistoryDAL: {
      findRecentlyAlarmedTargets: async () => opts.recentlyAlarmed ?? [],
      createWithTargets: async (_alarmId: string, options: { status: string }, deliveries: TDelivery[]) => {
        historyWrites.push({ deliveries, status: options.status });
        return {} as never;
      }
    },
    alarmProviderRegistry: registry,
    alarmRecipientResolver: {
      resolve: async () => opts.recipients ?? [{ userId: "u1", email: "user@example.com", firstName: "U" }]
    },
    kmsService: kmsServiceMock,
    orgDAL: { findOrgMembersByRole: async () => [] },
    notificationService: {
      createUserNotifications: async (data: unknown[]) => {
        createdNotifications.push(data);
      }
    },
    smtpService: {
      sendMail: async (opt: { recipients: string[] }) => {
        if (opts.failEmail) throw new Error("smtp down");
        if (opts.failEmailFor && opt.recipients.includes(opts.failEmailFor)) throw new Error("mailbox unavailable");
        sentMail.push({ recipients: opt.recipients });
      }
    }
  } as unknown as TAlarmEngineDep);

  return { engine, sentMail, createdNotifications, historyWrites };
};

describe("alarm engine", () => {
  test("dispatches email to resolved recipients and records a delivery per (target, channel)", async () => {
    const { engine, sentMail, createdNotifications, historyWrites } = buildEngine({
      targets: [{ id: "t1" }, { id: "t2" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }]
    });

    await engine.runAlarm(makeAlarm());

    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].recipients).toEqual(["user@example.com"]);
    expect(createdNotifications).toHaveLength(0); // no failure fallback on success
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].status).toBe(AlarmRunStatus.SUCCESS);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email", channelType: "email", status: AlarmRunStatus.SUCCESS },
      { targetId: "t2", channelId: "c-email", channelType: "email", status: AlarmRunStatus.SUCCESS }
    ]);
  });

  test("dedups a target already delivered on the same channel within the window", async () => {
    const { engine, historyWrites } = buildEngine({
      targets: [{ id: "t1" }, { id: "t2" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }],
      recentlyAlarmed: [{ channelId: "c-email", targetId: "t1" }]
    });

    await engine.runAlarm(makeAlarm());

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
      recentlyAlarmed: [{ channelId: "c-email-1", targetId: "t1" }]
    });

    await engine.runAlarm(makeAlarm());

    expect(sentMail).toHaveLength(1);
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email-2", channelType: "email", status: AlarmRunStatus.SUCCESS }
    ]);
  });

  test("records FAILED deliveries when a channel fails so they are re-tried next run", async () => {
    const { engine, sentMail, historyWrites } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }],
      failEmail: true
    });

    await engine.runAlarm(makeAlarm());

    expect(sentMail).toHaveLength(0);
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].status).toBe(AlarmRunStatus.FAILED);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email", channelType: "email", status: AlarmRunStatus.FAILED }
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

    await engine.runAlarm(makeAlarm());

    // The healthy recipient still got the mail.
    expect(sentMail.flatMap((m) => m.recipients)).toEqual(["good@example.com"]);
    // The target is recorded SUCCESS despite the one bounce, so it won't re-fire (and re-spam the
    // healthy recipient) on the next run.
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email", channelType: "email", status: AlarmRunStatus.SUCCESS }
    ]);
  });

  test("fails a directed channel with no resolved recipients instead of dispatching to undefined", async () => {
    const { engine, sentMail, historyWrites } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }],
      recipients: [] // group emptied / user deleted at runtime
    });

    await engine.runAlarm(makeAlarm());

    // No send is attempted with an undefined recipient.
    expect(sentMail).toHaveLength(0);
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].status).toBe(AlarmRunStatus.FAILED);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email", channelType: "email", status: AlarmRunStatus.FAILED }
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

    await engine.runAlarm(makeAlarm());

    expect(historyWrites).toHaveLength(1);
    // Only the first 10 targets are dispatched and recorded; the other 5 get no history row, so they
    // are re-evaluated and paged on the next run rather than being silently marked delivered.
    expect(historyWrites[0].deliveries).toHaveLength(10);
    expect(historyWrites[0].deliveries.map((d) => d.targetId)).toEqual(Array.from({ length: 10 }, (_, i) => `t${i}`));
    expect(historyWrites[0].deliveries.every((d) => d.status === AlarmRunStatus.SUCCESS)).toBe(true);
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
      recentlyAlarmed: Array.from({ length: 10 }, (_, i) => ({ channelId: "c-pd", targetId: `t${i}` }))
    });

    await engine.runAlarm(makeAlarm());

    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].deliveries.map((d) => d.targetId)).toEqual(["t10", "t11", "t12", "t13", "t14"]);
  });

  test("skips entirely when every channel already delivered every target", async () => {
    const { engine, historyWrites, sentMail } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }],
      recentlyAlarmed: [{ channelId: "c-email", targetId: "t1" }]
    });

    await engine.runAlarm(makeAlarm());

    expect(sentMail).toHaveLength(0);
    expect(historyWrites).toHaveLength(0);
  });

  test("writes no history when there are no enabled channels", async () => {
    const { engine, historyWrites } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: false }]
    });

    await engine.runAlarm(makeAlarm());

    expect(historyWrites).toHaveLength(0);
  });
});
