import { AlertChannelType, SlackChannelConfigSchema, TAlertPayload } from "../alert-channel-types";
import { sendEmailNotification } from "./alert-channel-email-fns";
import { buildPagerDutyEvent } from "./alert-channel-pagerduty-fns";
import { ALERT_CHANNEL_REGISTRY } from "./alert-channel-registry";
import { isAxiosErrorRetryable } from "./alert-channel-retry-fns";
import { buildSlackPayload } from "./alert-channel-slack-fns";
import { buildWebhookPayload } from "./alert-channel-webhook-fns";

const samplePayload = (): TAlertPayload => ({
  alert: {
    id: "alert-1",
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
    smtpService: { sendMail: async () => undefined }
  }
});

describe("alert channel registry", () => {
  test("exposes all four channels with correct directed flags", () => {
    expect(ALERT_CHANNEL_REGISTRY[AlertChannelType.EMAIL].directed).toBe(true);
    expect(ALERT_CHANNEL_REGISTRY[AlertChannelType.SLACK].directed).toBe(false);
    expect(ALERT_CHANNEL_REGISTRY[AlertChannelType.WEBHOOK].directed).toBe(false);
    expect(ALERT_CHANNEL_REGISTRY[AlertChannelType.PAGERDUTY].directed).toBe(false);
  });

  test("each entry is keyed by its own type", () => {
    Object.entries(ALERT_CHANNEL_REGISTRY).forEach(([key, def]) => {
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
    expect(wh.source).toBe("/projects/proj-1/alerts/alert-1");
    expect(wh.data.metadata.totalItems).toBe(2);
    expect(wh.data.items).toHaveLength(2);
    expect(wh.data.alert.condition).toBe("30d");
  });

  test("uses an org-less source when there is no project", () => {
    const payload = samplePayload();
    payload.alert.projectId = undefined;
    expect(buildWebhookPayload(payload).source).toBe("/alerts/alert-1");
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

  test("escapes Slack control characters in resource-controlled values", () => {
    const payload = samplePayload();
    payload.alert.name = "<!channel> ping";
    payload.items[0].title = "<https://evil.com|View in Infisical>";
    payload.items[0].fields = [{ label: "Note", value: "a & b < c > d" }];

    const slack = buildSlackPayload(payload);
    // Everything mrkdwn-interpreted: the notification fallback + the attachment blocks.
    const mrkdwn = JSON.stringify({ text: slack.text, attachments: slack.attachments });

    expect(mrkdwn).not.toContain("<!channel>");
    expect(mrkdwn).not.toContain("<https://evil.com|");
    expect(mrkdwn).toContain("&lt;!channel&gt;");
    expect(mrkdwn).toContain("a &amp; b &lt; c &gt; d");
    // The plain_text header does not parse markup, so it keeps the raw value.
    expect(slack.blocks[0].text?.text).toContain("<!channel> ping");
  });
});

describe("buildPagerDutyEvent", () => {
  test("uses a per-target dedup key so each target is its own incident", () => {
    const payload = samplePayload();
    const first = buildPagerDutyEvent(payload, payload.items[0], "a".repeat(32));
    const second = buildPagerDutyEvent(payload, payload.items[1], "a".repeat(32));

    expect(first.dedup_key).toBe("alert-1:cert-a");
    expect(second.dedup_key).toBe("alert-1:cert-b");
    expect(first.dedup_key).not.toBe(second.dedup_key);
  });

  test("carries provider severity and the target's own fields", () => {
    const payload = samplePayload();
    const pd = buildPagerDutyEvent(payload, payload.items[0], "a".repeat(32));

    expect(pd.routing_key).toBe("a".repeat(32));
    expect(pd.payload.severity).toBe("warning");
    expect(pd.payload.custom_details.title).toBe("api.prod.example.com");
    expect(pd.payload.custom_details.identifier).toBe("4B:3E:2F:A1");
    expect(pd.payload.custom_details.fields.Expires).toBe("2025-11-12");
  });
});

describe("SlackChannelConfigSchema webhook allowlist", () => {
  test("rejects a lookalike host", () => {
    expect(SlackChannelConfigSchema.safeParse({ webhookUrl: "https://hooks.slack.com.evil.com/x" }).success).toBe(
      false
    );
  });

  test("rejects non-https", () => {
    expect(SlackChannelConfigSchema.safeParse({ webhookUrl: "http://hooks.slack.com/x" }).success).toBe(false);
  });

  test("accepts a valid hooks.slack.com https URL", () => {
    expect(SlackChannelConfigSchema.safeParse({ webhookUrl: "https://hooks.slack.com/services/T/B/x" }).success).toBe(
      true
    );
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

describe("isAxiosErrorRetryable", () => {
  test("retries on 429 (rate limit) so a short backoff can recover", () => {
    expect(isAxiosErrorRetryable({ response: { status: 429 } })).toBe(true);
  });

  test("retries on 5xx and network/timeout errors", () => {
    expect(isAxiosErrorRetryable({ response: { status: 503 } })).toBe(true);
    expect(isAxiosErrorRetryable({ code: "ECONNRESET" })).toBe(true);
    expect(isAxiosErrorRetryable({ message: "socket hang up timeout" })).toBe(true);
  });

  test("does not retry on other 4xx client errors", () => {
    expect(isAxiosErrorRetryable({ response: { status: 400 } })).toBe(false);
    expect(isAxiosErrorRetryable({ response: { status: 404 } })).toBe(false);
  });
});
