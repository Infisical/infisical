import { ErrorCode } from "@slack/web-api";

import { SlackAppChannelConfigSchema, TAlertChannelDeps, TAlertPayload } from "../alert-channel-types";
import { assertSlackAppConfigInScope, sendSlackAppNotification } from "./alert-channel-slack-app-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const { postMessage, clientOptions } = vi.hoisted(() => ({
  postMessage: vi.fn<(args: { channel: string; text: string }) => Promise<unknown>>(),
  clientOptions: [] as unknown[]
}));

vi.mock("@slack/web-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@slack/web-api")>()),
  WebClient: vi.fn().mockImplementation((_token: string, options: unknown) => {
    clientOptions.push(options);
    return { chat: { postMessage } };
  })
}));

const ORG_ID = "6f1f6f9e-4a4b-4a4b-8a8a-1f1f1f1f1f1f";
const INTEGRATION_ID = "0b9a9d3e-1c1c-4c4c-9d9d-2e2e2e2e2e2e";

const payload = (): TAlertPayload => ({
  alert: {
    id: "alert-1",
    name: "prod-cert-expiry",
    orgId: ORG_ID,
    resourceType: "cert-manager",
    viewUrl: "https://app.infisical.com/alerts"
  },
  eventKey: "cert-manager.certificate.expiry",
  eventLabel: "Expiry",
  webhookType: "com.infisical.cert-manager.certificate.expiry",
  resourceKind: "Certificate",
  resourceOwnerKind: "Certificate Manager",
  severity: "warning",
  summary: "1 certificate expiring within 30d",
  items: [{ id: "cert-a", title: "api.example.com" }]
});

const config = {
  workflowIntegrationId: INTEGRATION_ID,
  channels: [
    { id: "C0123ABCD", name: "team-payments" },
    { id: "C0456EFGH", name: "security" }
  ]
};

const slackIntegration = (overrides: Record<string, unknown> = {}) => ({
  id: INTEGRATION_ID,
  orgId: ORG_ID,
  integration: "slack",
  slug: "main-workspace",
  encryptedBotAccessToken: Buffer.from("encrypted"),
  ...overrides
});

const deps = (integration: ReturnType<typeof slackIntegration> | null = slackIntegration()) =>
  ({
    smtpService: { sendMail: async () => undefined },
    kmsDataKeyService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        encryptor: vi.fn(),
        decryptor: () => Buffer.from("xoxb-token")
      }))
    },
    slackIntegrationDAL: { findByIdWithWorkflowIntegrationDetails: vi.fn(async () => integration ?? undefined) }
  }) as unknown as TAlertChannelDeps;

const platformError = (error: string) =>
  Object.assign(new Error(error), { code: ErrorCode.PlatformError, data: { error } });

const send = (dependencies = deps()) =>
  sendSlackAppNotification({
    channelId: "chan-1",
    config,
    payload: payload(),
    deps: dependencies
  });

describe("SlackAppChannelConfigSchema", () => {
  test("accepts an integration with channels", () => {
    expect(SlackAppChannelConfigSchema.safeParse(config).success).toBe(true);
  });

  test("requires at least one channel", () => {
    expect(SlackAppChannelConfigSchema.safeParse({ ...config, channels: [] }).success).toBe(false);
  });

  test("rejects the same channel twice", () => {
    const result = SlackAppChannelConfigSchema.safeParse({
      ...config,
      channels: [config.channels[0], config.channels[0]]
    });
    expect(result.success).toBe(false);
  });

  test("rejects a user or DM ID so a channel can't message a person", () => {
    ["U0123ABCD", "D0123ABCD"].forEach((id) => {
      expect(SlackAppChannelConfigSchema.safeParse({ ...config, channels: [{ id, name: "x" }] }).success).toBe(false);
    });
  });

  test("rejects a channel ID that isn't a Slack ID", () => {
    const result = SlackAppChannelConfigSchema.safeParse({
      ...config,
      channels: [{ id: "<!channel>", name: "general" }]
    });
    expect(result.success).toBe(false);
  });
});

describe("assertSlackAppConfigInScope", () => {
  test("accepts an integration from the alert's org", async () => {
    await expect(assertSlackAppConfigInScope({ orgId: ORG_ID, config }, deps())).resolves.toBeUndefined();
  });

  test("rejects an integration from another org", async () => {
    await expect(
      assertSlackAppConfigInScope({ orgId: ORG_ID, config }, deps(slackIntegration({ orgId: "other-org" })))
    ).rejects.toThrow(/not found in this organization/);
  });

  test("rejects a Microsoft Teams integration", async () => {
    await expect(
      assertSlackAppConfigInScope({ orgId: ORG_ID, config }, deps(slackIntegration({ integration: "microsoft-teams" })))
    ).rejects.toThrow(/not found in this organization/);
  });
});

describe("sendSlackAppNotification", () => {
  beforeEach(() => {
    postMessage.mockReset();
    clientOptions.length = 0;
  });

  test("posts the alert to every selected channel", async () => {
    postMessage.mockResolvedValue({ ok: true });

    await expect(send()).resolves.toEqual({ success: true });
    expect(postMessage.mock.calls.map(([args]) => args.channel)).toEqual(["C0123ABCD", "C0456EFGH"]);
    expect(postMessage.mock.calls[0][0].text).toContain("prod-cert-expiry");
  });

  test("bounds the Slack client's retries and timeout", async () => {
    postMessage.mockResolvedValue({ ok: true });
    await send();
    expect(clientOptions[0]).toMatchObject({ rejectRateLimitedCalls: true, retryConfig: { retries: 2 } });
  });

  test("fails with a readable error when the integration was deleted", async () => {
    const result = await send(deps(null));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no longer exists/);
    expect(postMessage).not.toHaveBeenCalled();
  });

  test("does not post through an integration from another org", async () => {
    const result = await send(deps(slackIntegration({ orgId: "other-org" })));
    expect(result.success).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  test("tells the user to add the app when it isn't in the channel", async () => {
    postMessage.mockRejectedValue(platformError("not_in_channel"));
    const result = await send();
    expect(result.success).toBe(false);
    expect(result.error).toContain("The Infisical app isn't in #team-payments");
  });

  test("points at reconnecting when the token was revoked", async () => {
    postMessage.mockRejectedValue(platformError("token_revoked"));
    const result = await send();
    expect(result.error).toContain("Reconnect the Slack integration");
  });

  test("counts a run as delivered when one channel received it, and reports the other", async () => {
    postMessage.mockRejectedValueOnce(platformError("is_archived")).mockResolvedValueOnce({ ok: true });
    await expect(send()).resolves.toEqual({ success: true, error: "#team-payments is archived." });
  });

  test("reports a revoked token once, not once per channel", async () => {
    postMessage.mockRejectedValue(platformError("token_revoked"));
    const result = await send();
    expect(result.error?.match(/Reconnect/g)).toHaveLength(1);
  });

  test("names a rate limit and an unreachable Slack", async () => {
    postMessage
      .mockRejectedValueOnce(Object.assign(new Error("rl"), { code: ErrorCode.RateLimitedError }))
      .mockRejectedValueOnce(Object.assign(new Error("net"), { code: ErrorCode.RequestError }));
    const result = await send();
    expect(result.error).toContain("Slack rate limited the message to #team-payments");
    expect(result.error).toContain("Could not reach Slack to post to #security");
  });
});
