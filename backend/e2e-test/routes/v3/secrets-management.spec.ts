import { createMongoAbility } from "@casl/ability";
import { createFakeWebhookServer, TFakeWebhookServer } from "e2e-test/fakes/webhook-destination";
import { createIsolatedOrgAndProject, createProject } from "e2e-test/testUtils/fixtures";
import { createFolder } from "e2e-test/testUtils/folders";
import { projectScopedInsightsDepStubs, usageInsightsDepStubs } from "e2e-test/testUtils/insights";
import { createSecretV2, deleteSecretV2, updateSecretV2 } from "e2e-test/testUtils/secrets";
import { createWebhook, waitForWebhookRun } from "e2e-test/testUtils/webhooks";

import { isHsmActiveAndEnabled } from "@app/ee/services/hsm/hsm-fns";
import { insightsServiceFactory, TInsightsServiceFactoryDep } from "@app/ee/services/insights/insights-service";
import { TFeatureSet } from "@app/ee/services/license/license-types";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { internalKmsKeyVersionDALFactory } from "@app/services/kms/internal-kms-key-version-dal";
import { kmsKekHistoryDALFactory } from "@app/services/kms/kms-kek-history-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { kmsLegacyEncryptionKeyDALFactory } from "@app/services/kms/kms-legacy-encryption-key-dal";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { secretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

const ENV = "dev";
const PROD_ENV = "prod";

type TFoundSecret = {
  key: string;
  projectId: string;
  projectName: string;
  environment: { name: string; slug: string };
  secretPath: string;
};

// The e2e instance runs unlicensed, and value search sits behind the insights plan, so the route
// refuses every request here (insights.spec.ts asserts that). These tests are about what the index
// written by the secret routes finds, so they search through the service on the same database and
// KMS, with the plan and permission let through.
const buildValueSearch = async () => {
  // Spec files run in a separate module graph from the test server, so the env config and the
  // cryptography module must be initialized here as well (same process env, same result).
  initLogger();
  await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);

  const kmsRootConfigDAL = kmsRootConfigDALFactory(testDb);
  const kmsService = kmsServiceFactory({
    kmsRootConfigDAL,
    kmsLegacyEncryptionKeyDAL: kmsLegacyEncryptionKeyDALFactory(testDb),
    kmsKekHistoryDAL: kmsKekHistoryDALFactory(testDb),
    kmsDAL: kmskeyDALFactory(testDb),
    internalKmsDAL: internalKmsDALFactory(testDb),
    internalKmsKeyVersionDAL: internalKmsKeyVersionDALFactory(testDb),
    orgDAL: orgDALFactory(testDb),
    projectDAL: projectDALFactory(testDb),
    hsmService: testHsmService,
    // startService never touches the key store; only the factory's dependency type requires it.
    keyStore: {
      getItem: async () => null,
      setItemWithExpiry: async () => "OK" as const,
      deleteItem: async () => 0
    },
    envConfig: getConfig()
  });
  await kmsService.startService(await isHsmActiveAndEnabled({ hsmService: testHsmService, kmsRootConfigDAL }));

  const insightsService = insightsServiceFactory({
    ...projectScopedInsightsDepStubs,
    ...usageInsightsDepStubs,
    orgDAL: orgDALFactory(testDb),
    secretV2BridgeDAL: secretV2BridgeDALFactory({ db: testDb, keyStore: testKeyStore }),
    folderDAL: secretFolderDALFactory(testDb),
    kmsService,
    permissionService: {
      getOrgPermission: async () => ({
        permission: createMongoAbility<OrgPermissionSet>([
          {
            action: OrgPermissionSecretsManagementInsightsActions.SearchAllSecretValues,
            subject: OrgPermissionSubjects.SecretsManagementInsights
          }
        ]),
        memberships: [],
        hasRole: () => false
      })
    } as unknown as TInsightsServiceFactoryDep["permissionService"],
    licenseService: {
      getPlan: async () => ({ secretAccessInsights: true }) as unknown as TFeatureSet
    } as TInsightsServiceFactoryDep["licenseService"]
  } as unknown as TInsightsServiceFactoryDep);

  return async (secretValue: string, orgId: string): Promise<TFoundSecret[]> =>
    insightsService.searchOrgSecretsByValue({
      secretValue,
      orgId,
      actor: ActorType.USER,
      actorId: "value-search-e2e",
      actorAuthMethod: AuthMethod.EMAIL,
      actorOrgId: orgId
    });
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
    let searchByValue: Awaited<ReturnType<typeof buildValueSearch>>;

    beforeAll(async () => {
      searchByValue = await buildValueSearch();
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
      expect(await searchByValue("the-old-value", orgId)).toHaveLength(1);

      await updateSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "ROTATES",
        value: "the-new-value",
        authToken
      });

      expect(await searchByValue("the-old-value", orgId)).toEqual([]);
      expect(await searchByValue("the-new-value", orgId)).toHaveLength(1);
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

      const found = await searchByValue("survives-a-rename", orgId);
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
      expect(await searchByValue("here-then-gone", orgId)).toHaveLength(1);

      await deleteSecretV2({
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        key: "TEMPORARY",
        authToken
      });

      expect(await searchByValue("here-then-gone", orgId)).toEqual([]);
    });

    // This is the test the org-scoped index exists for. The project-scoped digest cannot match across
    // projects, so a search that found only the first project would still be broken for the case the
    // feature was built for: a value is believed compromised, so where else is it?
    test("a value held across projects, environments and folders is found in each", async () => {
      const shared = `across-projects-${Date.now()}`;

      const secondProjectId = await createProject(authToken, "secrets-management-e2e-second");
      await createFolder({ workspaceId: projectId, environmentSlug: ENV, secretPath: "/", name: "nested", authToken });

      const copies = [
        { workspaceId: projectId, environmentSlug: ENV, secretPath: "/", key: "IN_FIRST_ROOT" },
        { workspaceId: projectId, environmentSlug: ENV, secretPath: "/nested", key: "IN_FIRST_NESTED" },
        { workspaceId: projectId, environmentSlug: PROD_ENV, secretPath: "/", key: "IN_FIRST_PROD" },
        { workspaceId: secondProjectId, environmentSlug: ENV, secretPath: "/", key: "IN_SECOND_PROJECT" }
      ];
      for await (const copy of copies) {
        await createSecretV2({ ...copy, value: shared, authToken });
      }

      const found = await searchByValue(shared, orgId);
      expect(at(found)).toEqual([
        `${ENV}/IN_FIRST_ROOT`,
        `${ENV}/IN_SECOND_PROJECT`,
        `${ENV}/nestedIN_FIRST_NESTED`,
        `${PROD_ENV}/IN_FIRST_PROD`
      ]);
      expect(new Set(found.map((f) => f.projectId))).toEqual(new Set([projectId, secondProjectId]));
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

        expect(await searchByValue(value, other.orgId)).toHaveLength(1);
        expect(await searchByValue(value, orgId)).toEqual([]);
        expect(other.orgId).not.toBe(orgId);
      } finally {
        await other.cleanup();
      }
    });
  });
});
