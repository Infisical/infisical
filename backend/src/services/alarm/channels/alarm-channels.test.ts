import { NotificationType } from "@app/services/notification/notification-types";

import { AlarmChannelType, TAlarmPayload } from "../alarm-channel-types";
import { sendEmailNotification } from "./alarm-channel-email-fns";
import { sendInAppNotification } from "./alarm-channel-inapp-fns";
import { buildPagerDutyPayload } from "./alarm-channel-pagerduty-fns";
import { ALARM_CHANNEL_REGISTRY } from "./alarm-channel-registry";
import { buildSlackPayload, validateSlackWebhookUrl } from "./alarm-channel-slack-fns";
import { buildWebhookPayload } from "./alarm-channel-webhook-fns";

const samplePayload = (): TAlarmPayload => ({
  alarm: {
    id: "alarm-1",
    name: "prod-cert-expiry",
    orgId: "org-1",
    projectId: "proj-1",
    resourceType: "pki.certificate",
    condition: "30d",
    viewUrl: "https://app.infisical.com/inventory"
  },
  eventKey: "pki.certificate.expiration",
  eventLabel: "Expiration",
  webhookType: "com.infisical.pki.certificate.expiration",
  resourceKind: "Certificate",
  severity: "warning",
  summary: "2 certificates expiring within 30d",
  notificationType: NotificationType.PKI_ALERT_CHANNEL_FAILED,
  items: [
    {
      id: "cert-a",
      title: "api.prod.example.com",
      identifier: "4B:3E:2F:A1",
      fields: [
        { label: "Expires", value: "2025-11-12" },
        { label: "Days Until Expiry", value: "7" }
      ]
    },
    {
      id: "cert-b",
      title: "web.example.com",
      identifier: "8A:7F:1C:E4",
      fields: [{ label: "Expires", value: "2025-11-10" }]
    }
  ]
});

const baseCtx = () => ({
  channelId: "chan-1",
  payload: samplePayload(),
  deps: {
    smtpService: { sendMail: async () => undefined },
    notificationService: { createUserNotifications: async () => undefined }
  }
});

describe("alarm channel registry", () => {
  test("exposes all five channels with correct directed flags", () => {
    expect(ALARM_CHANNEL_REGISTRY[AlarmChannelType.IN_APP].directed).toBe(true);
    expect(ALARM_CHANNEL_REGISTRY[AlarmChannelType.EMAIL].directed).toBe(true);
    expect(ALARM_CHANNEL_REGISTRY[AlarmChannelType.SLACK].directed).toBe(false);
    expect(ALARM_CHANNEL_REGISTRY[AlarmChannelType.WEBHOOK].directed).toBe(false);
    expect(ALARM_CHANNEL_REGISTRY[AlarmChannelType.PAGERDUTY].directed).toBe(false);
  });

  test("each entry is keyed by its own type", () => {
    Object.entries(ALARM_CHANNEL_REGISTRY).forEach(([key, def]) => {
      expect(def.type).toBe(key);
    });
  });
});

describe("buildWebhookPayload", () => {
  test("wraps the payload in a CloudEvents 1.0 envelope", () => {
    const wh = buildWebhookPayload(samplePayload());
    expect(wh.specversion).toBe("1.0");
    expect(wh.type).toBe("com.infisical.pki.certificate.expiration");
    expect(wh.subject).toBe("pki.certificate.expiration");
    expect(wh.source).toBe("/projects/proj-1/alarms/alarm-1");
    expect(wh.data.metadata.totalItems).toBe(2);
    expect(wh.data.items).toHaveLength(2);
    expect(wh.data.alarm.condition).toBe("30d");
  });

  test("uses an org-less source when there is no project", () => {
    const payload = samplePayload();
    payload.alarm.projectId = undefined;
    expect(buildWebhookPayload(payload).source).toBe("/alarms/alarm-1");
  });
});

describe("buildSlackPayload", () => {
  test("builds a header, a colored attachment, and a view button", () => {
    const slack = buildSlackPayload(samplePayload());
    expect(slack.blocks[0].type).toBe("header");
    expect(slack.attachments?.[0].color).toBe("#f0b429"); // warning
    const hasButton = slack.attachments?.[0].blocks.some((b) => b.type === "actions");
    expect(hasButton).toBe(true);
  });

  test("caps displayed items at 2 and adds a +more indicator", () => {
    const payload = samplePayload();
    payload.items.push({ id: "cert-c", title: "extra.example.com" });
    const slack = buildSlackPayload(payload);
    const contextBlock = slack.attachments?.[0].blocks.find((b) => b.type === "context");
    expect(contextBlock).toBeDefined();
  });
});

describe("buildPagerDutyPayload", () => {
  test("uses the alarm id as dedup key and carries provider severity", () => {
    const pd = buildPagerDutyPayload(samplePayload(), "a".repeat(32));
    expect(pd.dedup_key).toBe("alarm-1");
    expect(pd.routing_key).toBe("a".repeat(32));
    expect(pd.payload.severity).toBe("warning");
    expect(pd.payload.custom_details.total_items).toBe(2);
    expect(pd.payload.custom_details.items[0].fields.Expires).toBe("2025-11-12");
  });
});

describe("validateSlackWebhookUrl", () => {
  test("rejects a lookalike host", () => {
    expect(() => validateSlackWebhookUrl("https://hooks.slack.com.evil.com/x")).toThrow();
  });

  test("rejects non-https", () => {
    expect(() => validateSlackWebhookUrl("http://hooks.slack.com/x")).toThrow();
  });
});

describe("sendEmailNotification (directed)", () => {
  test("delivers to the per-call recipient's address", async () => {
    let sentTo: string[] | undefined;
    const ctx = {
      ...baseCtx(),
      config: {},
      recipient: { userId: "u1", email: "user@example.com" },
      deps: {
        ...baseCtx().deps,
        smtpService: {
          sendMail: async (opts: { recipients: string[] }) => {
            sentTo = opts.recipients;
          }
        }
      }
    };
    const result = await sendEmailNotification(ctx);
    expect(result.success).toBe(true);
    expect(sentTo).toEqual(["user@example.com"]);
  });

  test("delivers to a raw EMAIL-address recipient (no user id)", async () => {
    let sentTo: string[] | undefined;
    const ctx = {
      ...baseCtx(),
      config: {},
      recipient: { email: "external@example.com" },
      deps: {
        ...baseCtx().deps,
        smtpService: {
          sendMail: async (opts: { recipients: string[] }) => {
            sentTo = opts.recipients;
          }
        }
      }
    };
    const result = await sendEmailNotification(ctx);
    expect(result.success).toBe(true);
    expect(sentTo).toEqual(["external@example.com"]);
  });

  test("fails when there is no recipient", async () => {
    const result = await sendEmailNotification({ ...baseCtx(), config: {} });
    expect(result.success).toBe(false);
  });
});

describe("sendInAppNotification (directed)", () => {
  test("creates a notification for the recipient", async () => {
    let created: unknown[] | undefined;
    const ctx = {
      ...baseCtx(),
      config: {},
      recipient: { userId: "u1", email: "user@example.com" },
      deps: {
        ...baseCtx().deps,
        notificationService: {
          createUserNotifications: async (data: unknown[]) => {
            created = data;
          }
        }
      }
    };
    const result = await sendInAppNotification(ctx);
    expect(result.success).toBe(true);
    expect(created).toHaveLength(1);
  });

  test("skips (success no-op) a raw EMAIL-address recipient with no user id", async () => {
    let created: unknown[] | undefined;
    const ctx = {
      ...baseCtx(),
      config: {},
      recipient: { email: "external@example.com" },
      deps: {
        ...baseCtx().deps,
        notificationService: {
          createUserNotifications: async (data: unknown[]) => {
            created = data;
          }
        }
      }
    };
    const result = await sendInAppNotification(ctx);
    expect(result.success).toBe(true);
    expect(created).toBeUndefined();
  });
});
