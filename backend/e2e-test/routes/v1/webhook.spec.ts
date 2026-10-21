import { createFakeWebhookServer, TFakeWebhookServer } from "e2e-test/fakes/webhook-destination";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createWebhook } from "e2e-test/testUtils/webhooks";

const ENV = "dev";

const SANITIZED_WEBHOOK_KEYS = [
  "createdAt",
  "envId",
  "environment",
  "eventsFilter",
  "id",
  "isDisabled",
  "lastRunErrorMessage",
  "lastStatus",
  "projectId",
  "secretPath",
  "type",
  "updatedAt"
];

describe("Webhook router", () => {
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;
  let fakeWebhookServer: TFakeWebhookServer;

  beforeAll(async () => {
    ({ projectId, authToken, cleanup } = await createIsolatedOrgAndProject("webhook-router-e2e"));
    fakeWebhookServer = await createFakeWebhookServer();
  });

  afterAll(async () => {
    await fakeWebhookServer.stop();
    await cleanup();
  });

  test("DELETE returns only the sanitized webhook fields", async () => {
    const webhook = await createWebhook({
      projectId,
      environmentSlug: ENV,
      webhookUrl: fakeWebhookServer.url,
      authToken
    });

    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/webhooks/${webhook.id}`,
      headers: { authorization: `Bearer ${authToken}` }
    });

    expect(res.statusCode).toBe(200);
    const deleted = res.json().webhook as Record<string, unknown>;
    // An exact key match, so a future encrypted column cannot leak through this route unnoticed.
    expect(Object.keys(deleted).sort()).toEqual(SANITIZED_WEBHOOK_KEYS);
    expect(deleted.id).toBe(webhook.id);
  });
});
