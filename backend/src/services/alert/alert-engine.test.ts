import { z } from "zod";

import { AlertDispatchOutcome } from "@app/lib/telemetry/metrics";

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

// Stub outbound HTTP so PagerDuty/Slack/webhook sends resolve without a real network call. When
// failForTargetId is set, the matching PagerDuty event (keyed by dedup_key `${alertId}:${targetId}`)
// rejects, so a test can drive a single-target failure.
const httpControl = vi.hoisted(() => ({ failForTargetId: null as string | null }));

vi.mock("@app/lib/validator", async (importActual) => ({
  ...(await importActual<typeof import("@app/lib/validator")>()),
  safeRequest: {
    post: async (_url: string, body: { dedup_key?: string }) => {
      if (httpControl.failForTargetId && body?.dedup_key === `alert-1:${httpControl.failForTargetId}`) {
        throw new Error("pagerduty rejected event");
      }
      return { data: {} };
    }
  }
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
  createdByActorId: "11111111-1111-1111-1111-111111111111",
  createdByActorType: "user",
  createdAt: new Date(),
  updatedAt: new Date()
});

const makeProvider = (targets: TTarget[], onFindDueTargets?: () => void): IResourceAlertProvider<TTarget> => ({
  resourceType: RESOURCE_TYPE,
  eventTypes: ["test.resource.expiration"],
  conditionSchema: z.any(),
  buildTestTargets: () => [],
  findDueTargets: async () => {
    onFindDueTargets?.();
    return targets;
  },
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
    resourceOwnerKind: "Test Owner",
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
  let findDueTargetsCalls = 0;
  registry.register(
    makeProvider(opts.targets, () => {
      findDueTargetsCalls += 1;
    }) as IResourceAlertProvider
  );

  const sentMail: Array<{ recipients: string[] }> = [];
  const historyWrites: Array<{ deliveries: TDelivery[]; status: string }> = [];
  // Tracks the peak number of overlapping sendMail calls so a test can assert the
  // run-wide delivery concurrency stays bounded. sendMail yields a macrotask before
  // resolving so concurrent sends genuinely overlap.
  let inFlightSends = 0;
  let peakConcurrentSends = 0;

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
        inFlightSends += 1;
        peakConcurrentSends = Math.max(peakConcurrentSends, inFlightSends);
        try {
          await new Promise((resolve) => {
            setTimeout(resolve, 2);
          });
          if (opts.failEmail) throw new Error("smtp down");
          if (opts.failEmailFor && opt.recipients.includes(opts.failEmailFor)) throw new Error("mailbox unavailable");
          sentMail.push({ recipients: opt.recipients });
        } finally {
          inFlightSends -= 1;
        }
      }
    }
  } as unknown as TAlertEngineDep);

  return {
    engine,
    sentMail,
    historyWrites,
    getPeakConcurrentSends: () => peakConcurrentSends,
    getFindDueTargetsCalls: () => findDueTargetsCalls
  };
};

describe("alert engine", () => {
  test("dispatches email to resolved recipients and records a delivery per (target, channel)", async () => {
    const { engine, sentMail, historyWrites } = buildEngine({
      targets: [{ id: "t1" }, { id: "t2" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }]
    });

    const outcome = await engine.runAlert(makeAlert());

    expect(outcome).toBe(AlertDispatchOutcome.DeliverySuccess);
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].recipients).toEqual(["user@example.com"]);
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].status).toBe(AlertRunStatus.SUCCESS);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email", channelType: "email", status: AlertRunStatus.SUCCESS },
      { targetId: "t2", channelId: "c-email", channelType: "email", status: AlertRunStatus.SUCCESS }
    ]);
  });

  test("records PagerDuty status per target so one failed event does not mark the rest failed", async () => {
    const { engine, historyWrites } = buildEngine({
      targets: [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
      channels: [
        {
          id: "c-pd",
          channelType: "pagerduty",
          encryptedConfig: encConfig({ integrationKey: "a".repeat(32) }),
          enabled: true
        }
      ]
    });

    httpControl.failForTargetId = "t2";
    try {
      await engine.runAlert(makeAlert());
    } finally {
      httpControl.failForTargetId = null;
    }

    expect(historyWrites).toHaveLength(1);
    const byTarget = Object.fromEntries(historyWrites[0].deliveries.map((d) => [d.targetId, d.status]));
    // Only the target whose event failed is recorded FAILED; the others stay SUCCESS so they dedup
    // and are not re-sent next run.
    expect(byTarget).toEqual({
      t1: AlertRunStatus.SUCCESS,
      t2: AlertRunStatus.FAILED,
      t3: AlertRunStatus.SUCCESS
    });
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

    const outcome = await engine.runAlert(makeAlert());

    // The run must not report success: a dropped notification has to be visible in telemetry.
    expect(outcome).toBe(AlertDispatchOutcome.DeliveryFailed);
    expect(sentMail).toHaveLength(0);
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].status).toBe(AlertRunStatus.FAILED);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email", channelType: "email", status: AlertRunStatus.FAILED }
    ]);
  });

  test("reports a partial run distinctly so one broken channel is not masked by a healthy one", async () => {
    const { engine, historyWrites } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [
        { id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true },
        {
          id: "c-slack",
          channelType: "slack",
          encryptedConfig: encConfig({ webhookUrl: "https://hooks.slack.com/services/x" }),
          enabled: true
        }
      ],
      failEmail: true
    });

    const outcome = await engine.runAlert(makeAlert());

    expect(outcome).toBe(AlertDispatchOutcome.DeliveryPartial);
    expect(historyWrites[0].status).toBe(AlertRunStatus.PARTIAL);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-email", channelType: "email", status: AlertRunStatus.FAILED },
      { targetId: "t1", channelId: "c-slack", channelType: "slack", status: AlertRunStatus.SUCCESS }
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

  test("skips a directed channel with no resolved recipients rather than dispatching to undefined or failing the run", async () => {
    const { engine, sentMail, historyWrites } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }],
      recipients: [] // group emptied / user deleted at runtime
    });

    const outcome = await engine.runAlert(makeAlert());

    // Nobody to notify is customer config drift, not a delivery fault: it must stay out of
    // delivery_failed (which we alarm on) and leave no failed history row to re-read as an incident.
    expect(outcome).toBe(AlertDispatchOutcome.NoRecipients);
    // No send is attempted with an undefined recipient.
    expect(sentMail).toHaveLength(0);
    expect(historyWrites).toHaveLength(0);
  });

  test("dispatches the reachable channels when only some are directed-but-empty", async () => {
    const { engine, historyWrites } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [
        { id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true },
        {
          id: "c-slack",
          channelType: "slack",
          encryptedConfig: encConfig({ webhookUrl: "https://hooks.slack.com/services/x" }),
          enabled: true
        }
      ],
      recipients: []
    });

    const outcome = await engine.runAlert(makeAlert());

    // The empty email channel neither fails the run nor records a delivery it never attempted.
    expect(outcome).toBe(AlertDispatchOutcome.DeliverySuccess);
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].deliveries).toEqual([
      { targetId: "t1", channelId: "c-slack", channelType: "slack", status: AlertRunStatus.SUCCESS }
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

    const outcome = await engine.runAlert(makeAlert());

    // The outcome feeds the dispatched/no-op ratio metric, so it has to name the stage that
    // discarded the work rather than just reporting "nothing happened".
    expect(outcome).toBe(AlertDispatchOutcome.AllDeduped);
    expect(sentMail).toHaveLength(0);
    expect(historyWrites).toHaveLength(0);
  });

  test("bounds concurrent deliveries across the whole run with one shared limiter, not per channel", async () => {
    // 5 directed channels x 20 recipients = 100 sends. A per-channel limiter would allow
    // up to 5 x 10 = 50 in flight; the shared run-wide limiter must keep the peak <= 10.
    const channels = Array.from({ length: 5 }, (_, i) => ({
      id: `c-email-${i}`,
      channelType: "email",
      encryptedConfig: encConfig({}),
      enabled: true
    }));
    const recipients = Array.from({ length: 20 }, (_, i) => ({ userId: `u${i}`, email: `u${i}@example.com` }));
    const { engine, sentMail, getPeakConcurrentSends } = buildEngine({ targets: [{ id: "t1" }], channels, recipients });

    await engine.runAlert(makeAlert());

    expect(sentMail).toHaveLength(100);
    expect(getPeakConcurrentSends()).toBeLessThanOrEqual(10);
    // Sanity: sends actually overlapped, so the assertion above is meaningful.
    expect(getPeakConcurrentSends()).toBeGreaterThan(1);
  });

  test("writes no history and skips the resource scan when there are no enabled channels", async () => {
    const { engine, historyWrites, getFindDueTargetsCalls } = buildEngine({
      targets: [{ id: "t1" }],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: false }]
    });

    const outcome = await engine.runAlert(makeAlert());

    expect(outcome).toBe(AlertDispatchOutcome.NoChannels);
    expect(historyWrites).toHaveLength(0);
    // The scan is the expensive part of a run; a channel-less alert must not pay for it daily.
    expect(getFindDueTargetsCalls()).toBe(0);
  });

  test("reports no due targets when nothing matches the condition", async () => {
    const { engine, historyWrites } = buildEngine({
      targets: [],
      channels: [{ id: "c-email", channelType: "email", encryptedConfig: encConfig({}), enabled: true }]
    });

    const outcome = await engine.runAlert(makeAlert());

    expect(outcome).toBe(AlertDispatchOutcome.NoDueTargets);
    expect(historyWrites).toHaveLength(0);
  });
});
