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
