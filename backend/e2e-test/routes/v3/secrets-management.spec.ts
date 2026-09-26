import { createFakeWebhookServer, TFakeWebhookServer } from "e2e-test/fakes/webhook-destination";
import { createIsolatedOrgAndProject, createProject } from "e2e-test/testUtils/fixtures";
import { createFolder } from "e2e-test/testUtils/folders";
import { createSecretV2, deleteSecretV2, updateSecretV2 } from "e2e-test/testUtils/secrets";
import { createWebhook, waitForWebhookRun } from "e2e-test/testUtils/webhooks";

const ENV = "dev";
const PROD_ENV = "prod";

type TFoundSecret = {
  key: string;
  projectId: string;
  projectName: string;
  environment: { name: string; slug: string };
  secretPath: string;
};

const searchByValue = async (
  secretValue: string,
  authToken: string,
  scope?: { scope: "project"; projectId: string }
) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v4/secrets/search-by-value",
    headers: { authorization: `Bearer ${authToken}` },
    body: { secretValue, ...scope }
  });
  expect(res.statusCode).toBe(200);
  return res.json().secrets as TFoundSecret[];
};

const at = (secrets: TFoundSecret[]) => secrets.map((s) => `${s.environment.slug}${s.secretPath}${s.key}`).sort();

// Covers domain-level side effects of secrets management actions, as distinct from the routes'
// own CRUD behavior (secrets.spec.ts / secrets-v2.spec.ts). A webhook is the observable signal
// used here, but the thing under test is that the domain action fires the event, not webhook
// delivery mechanics.
describe("Secrets management", () => {
  // A webhook run is a queue round trip (1s debounce delay + the HTTP attempt), so it takes longer
  // than the 5s default.
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  let orgId: string;
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ orgId, projectId, authToken, cleanup } = await createIsolatedOrgAndProject("secrets-management-e2e"));
  });

  afterAll(async () => {
    await cleanup();
  });

  describe("Secret changes trigger webhook events", () => {
    let fakeWebhookServer: TFakeWebhookServer;

    beforeAll(async () => {
      fakeWebhookServer = await createFakeWebhookServer();
    });

    afterAll(async () => {
      await fakeWebhookServer.stop();
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

  describe("Finding a secret by its value", () => {
    test("a value that nothing holds is not found", async () => {
      expect(await searchByValue("a-value-no-secret-holds", authToken)).toEqual([]);
    });

    test("a value is found at the one place that holds it", async () => {
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "FINDABLE",
        value: "find-me-please",
        authToken
      });

      const found = await searchByValue("find-me-please", authToken);

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        key: "FINDABLE",
        projectId,
        environment: { slug: ENV },
        secretPath: "/"
      });
    });

    // The question this API exists to answer: a value is believed compromised, so where else is it?
    test("a value copied across environments and folders is found in every one of them", async () => {
      await createFolder({ workspaceId: projectId, environmentSlug: ENV, secretPath: "/", name: "nested", authToken });

      const shared = "the-same-value-everywhere";
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "COPY_ROOT",
        value: shared,
        authToken
      });
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/nested",
        key: "COPY_NESTED",
        value: shared,
        authToken
      });
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: PROD_ENV,
        secretPath: "/",
        key: "COPY_PROD",
        value: shared,
        authToken
      });

      expect(at(await searchByValue(shared, authToken))).toEqual([
        `${ENV}/COPY_ROOT`,
        `${ENV}/nestedCOPY_NESTED`,
        `${PROD_ENV}/COPY_PROD`
      ]);
    });

    test("a near-miss value is not found", async () => {
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "EXACT",
        value: "case-sensitive-value",
        authToken
      });

      expect(await searchByValue("Case-Sensitive-Value", authToken)).toEqual([]);
      expect(await searchByValue("case-sensitive-valu", authToken)).toEqual([]);
    });

    // Whitespace inside a value is part of it. Whitespace around one is not: the secret write API
    // has always trimmed it off a submitted value, and the search applies the same transform, so a
    // value is looked for in the form it was stored rather than the form it was typed.
    test("inner whitespace is part of the value, surrounding whitespace is not", async () => {
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "INNER_SPACE",
        value: "two  spaces",
        authToken
      });

      expect(await searchByValue("two spaces", authToken)).toEqual([]);
      expect((await searchByValue("two  spaces", authToken)).map((s) => s.key)).toEqual(["INNER_SPACE"]);

      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "PADDED",
        value: "  padded-value  ",
        authToken
      });

      // Stored trimmed, and found whether or not the caller pastes the padding back.
      for (const query of ["padded-value", " padded-value ", "  padded-value  "]) {
        // eslint-disable-next-line no-await-in-loop
        const found = await searchByValue(query, authToken);
        expect(found).toHaveLength(1);
        expect(found[0].key).toBe("PADDED");
      }
    });

    test("a rotated value stops being found and the new one starts", async () => {
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "ROTATES",
        value: "the-old-value",
        authToken
      });
      expect(await searchByValue("the-old-value", authToken)).toHaveLength(1);

      await updateSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "ROTATES",
        value: "the-new-value",
        authToken
      });

      expect(await searchByValue("the-old-value", authToken)).toEqual([]);
      expect(await searchByValue("the-new-value", authToken)).toHaveLength(1);
    });

    // A rename carries no value, so the secret must still be findable by the value it still holds.
    test("renaming a secret does not stop it being found by its value", async () => {
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "BEFORE_RENAME",
        value: "survives-a-rename",
        authToken
      });

      await updateSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "BEFORE_RENAME",
        newKey: "AFTER_RENAME",
        authToken
      });

      const found = await searchByValue("survives-a-rename", authToken);
      expect(found).toHaveLength(1);
      expect(found[0].key).toBe("AFTER_RENAME");
    });

    test("a deleted secret stops being found", async () => {
      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "TEMPORARY",
        value: "here-then-gone",
        authToken
      });
      expect(await searchByValue("here-then-gone", authToken)).toHaveLength(1);

      await deleteSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "TEMPORARY",
        authToken
      });

      expect(await searchByValue("here-then-gone", authToken)).toEqual([]);
    });

    // This is the test the org-scoped index exists for. The project-scoped digest cannot match across
    // projects, so a search that found only the first project would pass every test above and still be
    // broken for the case the feature was built for.
    test("a value held in a second project of the same org is found in both, and project scope narrows it", async () => {
      const shared = `across-projects-${Date.now()}`;

      const secondProjectId = await createProject(authToken, "secrets-management-e2e-second");

      await createSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "IN_FIRST_PROJECT",
        value: shared,
        authToken
      });
      await createSecretV2({
        workspaceId: secondProjectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "IN_SECOND_PROJECT",
        value: shared,
        authToken
      });

      const found = await searchByValue(shared, authToken);
      expect(found.map((f) => f.key).sort()).toEqual(["IN_FIRST_PROJECT", "IN_SECOND_PROJECT"]);
      expect(new Set(found.map((f) => f.projectId))).toEqual(new Set([projectId, secondProjectId]));

      const inSecondOnly = await searchByValue(shared, authToken, { scope: "project", projectId: secondProjectId });
      expect(inSecondOnly.map((f) => f.key)).toEqual(["IN_SECOND_PROJECT"]);
    });

    // The org digest is keyed by the org data key, so one org's values must never match another's.
    test("a value held in another organization is not found", async () => {
      const other = await createIsolatedOrgAndProject("secrets-management-e2e-other");
      try {
        const value = "value-in-a-different-org";
        await createSecretV2({
          workspaceId: other.projectId,
          environmentSlug: ENV,
          secretPath: "/",
          key: "OTHER_ORG",
          value,
          authToken: other.authToken
        });

        expect(await searchByValue(value, other.authToken)).toHaveLength(1);
        expect(await searchByValue(value, authToken)).toEqual([]);
        expect(other.orgId).not.toBe(orgId);
      } finally {
        await other.cleanup();
      }
    });
  });
});
