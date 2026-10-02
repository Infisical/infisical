import { createFakeWebhookServer, TFakeWebhookServer } from "e2e-test/fakes/webhook-destination";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createSecretV2 } from "e2e-test/testUtils/secrets";
import { createWebhook, waitForWebhookRun } from "e2e-test/testUtils/webhooks";

const ENV = "dev";

// Covers domain-level side effects of secrets management actions, as distinct from the routes'
// own CRUD behavior (secrets.spec.ts / secrets-v2.spec.ts). A webhook is the observable signal
// used here, but the thing under test is that the domain action fires the event, not webhook
// delivery mechanics.
describe("Secrets management", () => {
  describe("Secret changes trigger webhook events", () => {
    // A run is a queue round trip (1s debounce delay + the HTTP attempt), so it takes longer
    // than the 5s default.
    vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

    let projectId: string;
    let authToken: string;
    let cleanup: () => Promise<void>;
    let fakeWebhookServer: TFakeWebhookServer;

    beforeAll(async () => {
      ({ projectId, authToken, cleanup } = await createIsolatedOrgAndProject("secrets-management-e2e"));
      fakeWebhookServer = await createFakeWebhookServer();
    });

    afterAll(async () => {
      await fakeWebhookServer.stop();
      await cleanup();
    });

    test("a secret change enqueues and runs a webhook delivery", async () => {
      const webhook = await createWebhook({
        projectId,
        environmentSlug: ENV,
        webhookUrl: fakeWebhookServer.url,
        authToken
      });
      expect(webhook.lastStatus).toBeNull();

      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "WEBHOOK_TRIGGER_TEST",
        value: "value",
        authToken
      });

      // The fake is shared by every test in this file, so messages from other tests can arrive
      // interleaved; matching on this test's own project is what makes waitForMessage return the
      // right one instead of racing whichever test's delivery happens to land first.
      const message = await fakeWebhookServer.waitForMessage(
        (m) => (m.body as { event?: string; project?: { workspaceId?: string } })?.project?.workspaceId === projectId
      );
      expect(message.method).toBe("POST");
      expect(message.body).toMatchObject({ event: "secrets.modified" });

      // lastStatus is only ever written by fnTriggerWebhook, which only runs inside the
      // SecretWebhook queue worker (secret-queue.ts). Confirming it lands on "success" is proof
      // the whole pipeline, not just delivery, completed.
      const ranWebhook = await waitForWebhookRun({ webhookId: webhook.id, authToken });
      expect(ranWebhook.lastStatus).toBe("success");
    });
  });
});
