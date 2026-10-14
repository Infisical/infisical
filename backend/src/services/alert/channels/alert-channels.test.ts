import { validateHeaderValue } from "node:http";

import { safeRequest } from "@app/lib/validator";

import {
  AlertChannelType,
  DIRECTED_ALERT_CHANNEL_TYPES,
  SlackChannelConfigSchema,
  TAlertPayload,
  WEBHOOK_MAX_HEADERS_LENGTH,
  WebhookAuthType,
  WebhookChannelConfigSchema
} from "../alert-channel-types";
import { sendEmailNotification } from "./alert-channel-email-fns";
import { buildPagerDutyEvent } from "./alert-channel-pagerduty-fns";
import { ALERT_CHANNEL_REGISTRY } from "./alert-channel-registry";
import { buildSlackPayload } from "./alert-channel-slack-fns";
import {
  assertWebhookUrlUnchangedForKeptCredentials,
  buildWebhookPayload,
  sendWebhookNotification
} from "./alert-channel-webhook-fns";

// logger is `export let logger` assigned by initLogger(), which unit tests don't run, so the
// delivery-failure path (which logs) would otherwise dereference undefined. Mock it per-file.
vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

vi.mock("@app/lib/validator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/validator")>()),
  safeRequest: { post: vi.fn(async () => ({ status: 200, data: {} })) }
}));

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
  resourceOwnerKind: "Certificate Authority",
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

  // The DALs read the constant instead of the registry (which would drag the send implementations
  // into the data layer), so it has to track the registry's directed flags.
  test("DIRECTED_ALERT_CHANNEL_TYPES matches the registry's directed flags", () => {
    const fromRegistry = Object.values(ALERT_CHANNEL_REGISTRY)
      .filter((def) => def.directed)
      .map((def) => def.type);

    expect([...DIRECTED_ALERT_CHANNEL_TYPES].sort()).toEqual(fromRegistry.sort());
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

  test("carries each item's typed resource for receivers that act on it", () => {
    const payload = samplePayload();
    payload.items[0].resource = { serialNumber: "abc", notAfter: "2026-10-04T23:59:00.000Z" };
    expect(buildWebhookPayload(payload).data.items[0].resource).toEqual({
      serialNumber: "abc",
      notAfter: "2026-10-04T23:59:00.000Z"
    });
  });

  test("prefers the provider's source and exposes the alert's resource id", () => {
    const payload = samplePayload();
    payload.webhookSource = "/applications/app-1/alerts/alert-1";
    payload.alert.resourceId = "app-1";
    const wh = buildWebhookPayload(payload);
    expect(wh.source).toBe("/applications/app-1/alerts/alert-1");
    expect(wh.data.alert.resourceId).toBe("app-1");
    expect(buildWebhookPayload(samplePayload()).data.alert).not.toHaveProperty("resourceId");
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
    const headerBlock = slack.blocks[0];
    expect(headerBlock.type).toBe("header");
    if (headerBlock.type === "header") {
      expect(headerBlock.text.text).toContain("<!channel> ping");
    }
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

  test("uses the target's own summary and severity when the provider sets them", () => {
    const payload = samplePayload();
    const item = {
      ...payload.items[1],
      summary: "Certificate 'web.example.com' expires on November 10, 2025",
      severity: "info" as const
    };
    const pd = buildPagerDutyEvent(payload, item, "a".repeat(32));

    expect(pd.payload.summary).toBe("Certificate 'web.example.com' expires on November 10, 2025");
    expect(pd.payload.severity).toBe("info");
  });

  test("falls back to the alert summary and severity for targets without their own", () => {
    const payload = samplePayload();
    const pd = buildPagerDutyEvent(payload, payload.items[0], "a".repeat(32));

    expect(pd.payload.summary).toBe("2 certificates expiring within 30d — api.prod.example.com");
    expect(pd.payload.severity).toBe("warning");
  });
});

describe("WebhookChannelConfigSchema headers", () => {
  const withHeaders = (headers: unknown) =>
    WebhookChannelConfigSchema.safeParse({ url: "https://example.com/hook", headers });

  test("rejects the headers Infisical sets itself", () => {
    const result = withHeaders([{ key: "Content-Type", value: "text/plain" }]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Header 'Content-Type' is set by Infisical and cannot be overridden");
    ["X-Infisical-Signature", "Content-Length", "Transfer-Encoding", "Connection", "Host"].forEach((key) => {
      expect(withHeaders([{ key, value: "x" }]).success).toBe(false);
    });
  });

  test("sends people to Authentication for the Authorization header", () => {
    const result = withHeaders([{ key: "authorization", value: "Bearer abc" }]);
    expect(result.error?.issues[0].message).toBe("Use Authentication to set the 'Authorization' header");
  });

  test("rejects duplicate names regardless of case", () => {
    const result = withHeaders([
      { key: "X-Env", value: "a" },
      { key: "x-env", value: "b" }
    ]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Header names must be unique");
  });

  test("rejects names that are not HTTP tokens", () => {
    expect(withHeaders([{ key: "X Bad", value: "a" }]).success).toBe(false);
  });

  test("accepts exactly the header values Node can send", () => {
    const values = [
      "Bearer abc123",
      "a\tb",
      "café",
      "a\u00a0b",
      "a\r\nX-Injected: b",
      "a\u0000b",
      "a\u001bb",
      "a\u007fb",
      "10€",
      "привет",
      "ok👍",
      "abc\u200bdef"
    ];
    values.forEach((value) => {
      let sendable = true;
      try {
        validateHeaderValue("X-Test", value);
      } catch {
        sendable = false;
      }
      expect(withHeaders([{ key: "X-Test", value }]).success).toBe(sendable);
    });
  });

  test("names the header whose value can't be sent", () => {
    const result = withHeaders([{ key: "X-Env", value: "prod\u200b" }]);
    expect(result.error?.issues[0].message).toBe(
      "The value for header 'X-Env' has a character that can't be sent in an HTTP header, such as an emoji, a control character, or an invisible space. Re-enter the value"
    );
  });
});

describe("WebhookChannelConfigSchema authentication", () => {
  const parse = (config: Record<string, unknown>) =>
    WebhookChannelConfigSchema.safeParse({ url: "https://example.com/hook", ...config });

  test("requires the fields of the chosen type", () => {
    expect(parse({ authType: WebhookAuthType.BEARER }).error?.issues[0].message).toBe(
      "Enter a token for bearer authentication"
    );
    expect(parse({ authType: WebhookAuthType.BASIC, basicUsername: "ops" }).error?.issues[0].message).toBe(
      "Enter a password for basic authentication"
    );
    expect(parse({ authType: WebhookAuthType.HEADER, authHeaderValue: "k" }).error?.issues[0].message).toBe(
      "Enter a header name for API key authentication"
    );
  });

  test("drops the fields of authentication types that are not in use", () => {
    const result = parse({
      authType: WebhookAuthType.BASIC,
      basicUsername: "ops",
      basicPassword: "pw",
      authCredentials: "stale-token"
    });
    expect(result.data).toEqual({
      url: "https://example.com/hook",
      authType: WebhookAuthType.BASIC,
      basicUsername: "ops",
      basicPassword: "pw"
    });
    expect(parse({ authCredentials: "stale-token" }).data).toEqual({ url: "https://example.com/hook" });
  });

  test("rejects a basic auth username with a colon", () => {
    expect(
      parse({ authType: WebhookAuthType.BASIC, basicUsername: "a:b", basicPassword: "pw" }).error?.issues[0].message
    ).toBe("The username cannot contain ':'");
  });

  test("rejects a custom header that repeats the API key header", () => {
    const result = parse({
      authType: WebhookAuthType.HEADER,
      authHeaderName: "X-API-Key",
      authHeaderValue: "k",
      headers: [{ key: "x-api-key", value: "other" }]
    });
    expect(result.error?.issues[0].message).toBe("Header 'X-API-Key' is already set by Authentication");
  });

  test("counts authentication toward the combined header length", () => {
    const authCredentials = "a".repeat(WEBHOOK_MAX_HEADERS_LENGTH - "X-Env".length - "prod".length);
    expect(
      parse({ authType: WebhookAuthType.BEARER, authCredentials, headers: [{ key: "X-Env", value: "prod" }] }).success
    ).toBe(true);

    const result = parse({
      authType: WebhookAuthType.BEARER,
      authCredentials: `${authCredentials}a`,
      headers: [{ key: "X-Env", value: "prod" }]
    });
    expect(result.error?.issues[0].message).toBe(
      `Authentication and custom headers can add up to at most ${WEBHOOK_MAX_HEADERS_LENGTH} characters`
    );
  });
});

describe("assertWebhookUrlUnchangedForKeptCredentials", () => {
  const stored = {
    url: "https://api.example.com/sources/abc",
    authType: WebhookAuthType.BEARER,
    authCredentials: "abc"
  };

  test("refuses to keep saved credentials when the URL changed, even on the same host", () => {
    expect(() =>
      assertWebhookUrlUnchangedForKeptCredentials(
        { url: "https://api.example.com/sources/attacker", authType: WebhookAuthType.BEARER },
        stored
      )
    ).toThrow(
      "Enter the authentication credentials again because the webhook URL changed. Saved credentials are only sent to the URL they were saved with"
    );
  });

  test("allows a changed URL when the credentials are entered again", () => {
    expect(() =>
      assertWebhookUrlUnchangedForKeptCredentials(
        { url: "https://other.example.com/hook", authType: WebhookAuthType.BEARER, authCredentials: "new" },
        stored
      )
    ).not.toThrow();
  });

  test("keeps saved credentials when only the host case differs", () => {
    expect(() =>
      assertWebhookUrlUnchangedForKeptCredentials(
        { url: "https://API.example.com/sources/abc", authType: WebhookAuthType.BEARER },
        stored
      )
    ).not.toThrow();
  });

  test("keeps the signing secret on a URL change, since it is never sent", () => {
    expect(() =>
      assertWebhookUrlUnchangedForKeptCredentials(
        { url: "https://other.example.com/hook" },
        { url: "https://example.com/hook", signingSecret: "s3cr3t" }
      )
    ).not.toThrow();
  });
});

describe("sendWebhookNotification", () => {
  const send = async (config: Record<string, unknown>) => {
    const post = vi.mocked(safeRequest.post);
    post.mockClear();
    await sendWebhookNotification({ ...baseCtx(), config: { url: "https://example.com/hook", ...config } });
    expect(post).toHaveBeenCalledTimes(1);
    return post.mock.calls[0];
  };

  test("sends the custom headers next to the ones Infisical sets", async () => {
    const [url, , options] = await send({ signingSecret: "s3cr3t", headers: [{ key: "X-Env", value: "prod" }] });
    expect(url).toBe("https://example.com/hook");
    expect(options?.headers).toMatchObject({ "X-Env": "prod", "Content-Type": "application/json" });
    expect(options?.headers?.["x-infisical-signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });

  test("sends each authentication type", async () => {
    const [, , bearer] = await send({ authType: WebhookAuthType.BEARER, authCredentials: "abc" });
    expect(bearer?.headers).toMatchObject({ Authorization: "Bearer abc" });

    const [, , basic] = await send({ authType: WebhookAuthType.BASIC, basicUsername: "ops", basicPassword: "pw" });
    expect(basic?.headers).toMatchObject({ Authorization: `Basic ${Buffer.from("ops:pw").toString("base64")}` });

    const [, , header] = await send({
      authType: WebhookAuthType.HEADER,
      authHeaderName: "X-API-Key",
      authHeaderValue: "k"
    });
    expect(header?.headers).toMatchObject({ "X-API-Key": "k" });
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

  test("lists at most 50 items and counts the rest so a large run renders quickly", async () => {
    let substitutions: { items: unknown[]; remainingCount: number } | undefined;
    const payload = samplePayload();
    payload.items = Array.from({ length: 120 }, (_, index) => ({
      id: `cert-${index}`,
      title: `cert-${index}.example.com`
    }));
    const ctx = {
      ...baseCtx(),
      payload,
      config: {},
      recipient: { email: "user@example.com" },
      deps: {
        smtpService: {
          sendMail: async (opts: { substitutions: object }) => {
            substitutions = opts.substitutions as { items: unknown[]; remainingCount: number };
          }
        }
      }
    };

    await sendEmailNotification(ctx);

    expect(substitutions?.items).toHaveLength(50);
    expect(substitutions?.remainingCount).toBe(70);
  });

  test("shows every item and no remainder when the run is small", async () => {
    let substitutions: { items: unknown[]; remainingCount: number } | undefined;
    const ctx = {
      ...baseCtx(),
      config: {},
      recipient: { email: "user@example.com" },
      deps: {
        smtpService: {
          sendMail: async (opts: { substitutions: object }) => {
            substitutions = opts.substitutions as { items: unknown[]; remainingCount: number };
          }
        }
      }
    };

    await sendEmailNotification(ctx);

    expect(substitutions?.items).toHaveLength(2);
    expect(substitutions?.remainingCount).toBe(0);
  });

  test("fails when there is no recipient", async () => {
    const result = await sendEmailNotification({ ...baseCtx(), config: {} });
    expect(result.success).toBe(false);
  });

  // SMTP submission has no idempotency key, so a retry across an ambiguous failure would deliver the
  // same alert twice. The send is attempted once and the failure is surfaced instead, matching every
  // other email path on the platform; the engine records it so the next run retries the target.
  test("attempts a failing send once and reports the error rather than retrying", async () => {
    let attempts = 0;
    const ctx = {
      ...baseCtx(),
      config: {},
      recipient: { email: "user@example.com" },
      deps: {
        ...baseCtx().deps,
        smtpService: {
          sendMail: async () => {
            attempts += 1;
            throw new Error("connection timeout");
          }
        }
      }
    };

    const result = await sendEmailNotification(ctx);

    expect(attempts).toBe(1);
    expect(result.success).toBe(false);
    expect(result.error).toBe("connection timeout");
  });
});
