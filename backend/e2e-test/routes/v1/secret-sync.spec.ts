import { fakeParameterStore } from "e2e-test/fakes/aws-parameter-store-sync-fns";
import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { createSecretImport } from "e2e-test/testUtils/secret-imports";
import {
  createAwsAppConnection,
  createSecretSync,
  deleteAppConnection,
  expectNoSyncRun,
  importSecretsForSync,
  removeSecretsForSync,
  triggerSecretSync
} from "e2e-test/testUtils/secret-syncs";
import { createSecretV2, deleteSecretV2, getSecretsV2 } from "e2e-test/testUtils/secrets";

import { SecretSyncInitialSyncBehavior } from "@app/services/secret-sync/secret-sync-enums";
import { SecretSyncStatus } from "@app/services/secret-sync/secret-sync-types";

// Covers the @e2e scenarios of "Feature: Secret Syncs" in the Test Specifications for Secrets
// Management. Each describe is one Rule and each test name is one Scenario, so a behavior
// change should show up here as an edited assertion rather than a silent pass.
//
// The destination is AWS Parameter Store, faked for the whole run (e2e-test/fakes/ and the
// alias block in vitest.e2e.config.mts). What is under test is Infisical resolving a set of
// secrets and handing them over, not AWS.

const REGION = "us-east-1";
const ENV = "dev";

// A distinct destination path per test, so a store leaking out of one test cannot be mistaken
// for another's result.
const pathFor = (name: string) => `/${name}/`;

describe("Secret syncs", async () => {
  let projectId: string;
  let connectionId: string;

  beforeAll(async () => {
    const projectRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: { projectName: `secret-sync-e2e-${Date.now()}` }
    });
    expect(projectRes.statusCode).toBe(200);
    projectId = projectRes.json().project.id as string;

    // Connections are org-scoped while syncs are project-scoped, so the name has to be unique
    // across the whole shared seeded org.
    connectionId = await createAwsAppConnection({
      name: `secret-sync-e2e-${Date.now()}`,
      authToken: jwtAuthToken
    });

    await createFolder({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      name: "services"
    });
    await createFolder({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/services",
      name: "api"
    });
  });

  afterAll(async () => {
    await deleteAppConnection({ connectionId, authToken: jwtAuthToken });
    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
  });

  beforeEach(() => {
    fakeParameterStore.reset();
  });

  const addSecret = (secretPath: string, key: string, value: string) =>
    createSecretV2({ authToken: jwtAuthToken, workspaceId: projectId, environmentSlug: ENV, secretPath, key, value });

  const removeSecret = (secretPath: string, key: string) =>
    deleteSecretV2({ authToken: jwtAuthToken, workspaceId: projectId, environmentSlug: ENV, secretPath, key });

  const secretKeysAt = async (secretPath: string) => {
    const { secrets } = await getSecretsV2({
      authToken: jwtAuthToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath
    });
    return Object.fromEntries(secrets.map((secret) => [secret.secretKey, secret.secretValue]));
  };

  const newSync = async (
    name: string,
    overrides: Partial<Parameters<typeof createSecretSync>[0]> & { secretPath: string }
  ) => {
    const result = await createSecretSync({
      name,
      projectId,
      connectionId,
      environmentSlug: ENV,
      region: REGION,
      destinationPath: pathFor(name),
      authToken: jwtAuthToken,
      ...overrides
    });

    return result;
  };

  describe("A sync sends the secrets of its own source environment and secret path", () => {
    test("A sync sends the secrets of its source secret path", async () => {
      await addSecret("/services", "API_KEY", "api-value");

      const { secretSync } = await newSync("sends-source-path", { secretPath: "/services" });
      const sync = await triggerSecretSync({
        syncId: secretSync!.id,
        region: REGION,
        destinationPath: pathFor("sends-source-path"),
        authToken: jwtAuthToken
      });

      expect(sync.syncStatus).toBe(SecretSyncStatus.Succeeded);
      expect(fakeParameterStore.at(REGION, pathFor("sends-source-path")).read()).toEqual({ API_KEY: "api-value" });

      await removeSecret("/services", "API_KEY");
    });

    // The pin for recursive syncing. When a sync learns to walk child folders, this assertion
    // has to be rewritten deliberately rather than start failing by accident.
    test("A sync does not send the secrets of child secret paths", async () => {
      await addSecret("/services", "PARENT_KEY", "parent-value");
      await addSecret("/services/api", "CHILD_KEY", "child-value");

      const { secretSync } = await newSync("excludes-child-paths", { secretPath: "/services" });
      await triggerSecretSync({
        syncId: secretSync!.id,
        region: REGION,
        destinationPath: pathFor("excludes-child-paths"),
        authToken: jwtAuthToken
      });

      const delivered = fakeParameterStore.at(REGION, pathFor("excludes-child-paths")).read();
      expect(delivered).toEqual({ PARENT_KEY: "parent-value" });
      expect(delivered).not.toHaveProperty("CHILD_KEY");

      await removeSecret("/services", "PARENT_KEY");
      await removeSecret("/services/api", "CHILD_KEY");
    });
  });

  describe("A sync resolves imported and referenced secret values before sending them", () => {
    test("A secret imported into the source secret path is sent to the destination", async () => {
      await addSecret("/", "SHARED_KEY", "shared-value");
      await addSecret("/services", "OWN_KEY", "own-value");
      await createSecretImport({
        authToken: jwtAuthToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/services",
        importEnv: ENV,
        importPath: "/"
      });

      const { secretSync } = await newSync("includes-imports", { secretPath: "/services" });
      await triggerSecretSync({
        syncId: secretSync!.id,
        region: REGION,
        destinationPath: pathFor("includes-imports"),
        authToken: jwtAuthToken
      });

      expect(fakeParameterStore.at(REGION, pathFor("includes-imports")).read()).toEqual({
        OWN_KEY: "own-value",
        SHARED_KEY: "shared-value"
      });

      await removeSecret("/", "SHARED_KEY");
      await removeSecret("/services", "OWN_KEY");
    });
  });

  describe("The initial sync behavior decides what happens to secrets already at the destination", () => {
    test('Initial sync behavior "overwrite-destination" removes destination secrets Infisical does not have', async () => {
      await addSecret("/services", "API_KEY", "api-value");
      fakeParameterStore.at(REGION, pathFor("overwrite-destination")).seed({ STALE_KEY: "stale-value" });

      const { secretSync } = await newSync("overwrite-destination", {
        secretPath: "/services",
        initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination
      });
      await triggerSecretSync({
        syncId: secretSync!.id,
        region: REGION,
        destinationPath: pathFor("overwrite-destination"),
        authToken: jwtAuthToken
      });

      expect(fakeParameterStore.at(REGION, pathFor("overwrite-destination")).read()).toEqual({
        API_KEY: "api-value"
      });

      await removeSecret("/services", "API_KEY");
    });

    test('Initial sync behavior "import-prioritize-source" keeps the Infisical value for a shared secret key', async () => {
      await addSecret("/services", "API_KEY", "infisical-value");
      fakeParameterStore.at(REGION, pathFor("prioritize-source")).seed({ API_KEY: "destination-value" });

      const { secretSync } = await newSync("prioritize-source", {
        secretPath: "/services",
        initialSyncBehavior: SecretSyncInitialSyncBehavior.ImportPrioritizeSource
      });
      await triggerSecretSync({
        syncId: secretSync!.id,
        region: REGION,
        destinationPath: pathFor("prioritize-source"),
        authToken: jwtAuthToken
      });

      expect(fakeParameterStore.at(REGION, pathFor("prioritize-source")).read()).toEqual({
        API_KEY: "infisical-value"
      });
      expect(await secretKeysAt("/services")).toEqual({ API_KEY: "infisical-value" });

      await removeSecret("/services", "API_KEY");
    });

    test('Initial sync behavior "import-prioritize-destination" takes the destination value into Infisical', async () => {
      await addSecret("/services", "API_KEY", "infisical-value");
      fakeParameterStore.at(REGION, pathFor("prioritize-destination")).seed({ API_KEY: "destination-value" });

      const { secretSync } = await newSync("prioritize-destination", {
        secretPath: "/services",
        initialSyncBehavior: SecretSyncInitialSyncBehavior.ImportPrioritizeDestination
      });
      await triggerSecretSync({
        syncId: secretSync!.id,
        region: REGION,
        destinationPath: pathFor("prioritize-destination"),
        authToken: jwtAuthToken
      });

      // The import writes back into the project, which is the surprising half of this option.
      expect(await secretKeysAt("/services")).toEqual({ API_KEY: "destination-value" });
      expect(fakeParameterStore.at(REGION, pathFor("prioritize-destination")).read()).toEqual({
        API_KEY: "destination-value"
      });

      await removeSecret("/services", "API_KEY");
    });

    test("The initial sync behavior applies only to the first sync run", async () => {
      await addSecret("/services", "API_KEY", "api-value");

      const { secretSync } = await newSync("first-run-only", {
        secretPath: "/services",
        initialSyncBehavior: SecretSyncInitialSyncBehavior.ImportPrioritizeDestination
      });
      await triggerSecretSync({
        syncId: secretSync!.id,
        region: REGION,
        destinationPath: pathFor("first-run-only"),
        authToken: jwtAuthToken
      });

      // Arrives at the destination outside Infisical, after the first run has happened.
      fakeParameterStore.at(REGION, pathFor("first-run-only")).seed({ LATE_KEY: "late-value" });

      await triggerSecretSync({
        syncId: secretSync!.id,
        region: REGION,
        destinationPath: pathFor("first-run-only"),
        authToken: jwtAuthToken
      });

      expect(await secretKeysAt("/services")).toEqual({ API_KEY: "api-value" });
      expect(fakeParameterStore.at(REGION, pathFor("first-run-only")).read()).toEqual({ API_KEY: "api-value" });

      await removeSecret("/services", "API_KEY");
    });
  });

  describe("A later sync removes destination secrets Infisical no longer has, unless deletion is disabled", () => {
    test("Deleting a secret in Infisical removes it from the destination on the next sync run", async () => {
      await addSecret("/services", "API_KEY", "api-value");
      await addSecret("/services", "OLD_KEY", "old-value");

      const { secretSync } = await newSync("deletes-removed", { secretPath: "/services" });
      const address = { region: REGION, destinationPath: pathFor("deletes-removed"), authToken: jwtAuthToken };
      await triggerSecretSync({ syncId: secretSync!.id, ...address });

      await removeSecret("/services", "OLD_KEY");
      await triggerSecretSync({ syncId: secretSync!.id, ...address });

      expect(fakeParameterStore.at(REGION, pathFor("deletes-removed")).read()).toEqual({ API_KEY: "api-value" });

      await removeSecret("/services", "API_KEY");
    });

    test("The destination keeps the secret when the disable secret deletion parameter is set to true", async () => {
      await addSecret("/services", "API_KEY", "api-value");
      await addSecret("/services", "OLD_KEY", "old-value");

      const { secretSync } = await newSync("keeps-removed", {
        secretPath: "/services",
        disableSecretDeletion: true
      });
      const address = { region: REGION, destinationPath: pathFor("keeps-removed"), authToken: jwtAuthToken };
      await triggerSecretSync({ syncId: secretSync!.id, ...address });

      await removeSecret("/services", "OLD_KEY");
      await triggerSecretSync({ syncId: secretSync!.id, ...address });

      expect(fakeParameterStore.at(REGION, pathFor("keeps-removed")).read()).toEqual({
        API_KEY: "api-value",
        OLD_KEY: "old-value"
      });

      await removeSecret("/services", "API_KEY");
    });
  });

  describe("Importing from a destination brings its secrets into the source secret path", () => {
    test("An import creates secrets the source secret path does not have", async () => {
      fakeParameterStore.at(REGION, pathFor("import-creates")).seed({ DESTINATION_KEY: "destination-value" });

      const { secretSync } = await newSync("import-creates", { secretPath: "/services" });
      const { secretSync: imported } = await importSecretsForSync({
        syncId: secretSync!.id,
        importBehavior: "prioritize-source",
        authToken: jwtAuthToken
      });

      expect(imported!.importStatus).toBe(SecretSyncStatus.Succeeded);
      expect(await secretKeysAt("/services")).toEqual({ DESTINATION_KEY: "destination-value" });

      await removeSecret("/services", "DESTINATION_KEY");
    });

    test('An import with behavior "prioritize-destination" overwrites the Infisical value', async () => {
      await addSecret("/services", "API_KEY", "infisical-value");
      fakeParameterStore.at(REGION, pathFor("import-overwrites")).seed({ API_KEY: "destination-value" });

      const { secretSync } = await newSync("import-overwrites", { secretPath: "/services" });
      await importSecretsForSync({
        syncId: secretSync!.id,
        importBehavior: "prioritize-destination",
        authToken: jwtAuthToken
      });

      expect(await secretKeysAt("/services")).toEqual({ API_KEY: "destination-value" });

      await removeSecret("/services", "API_KEY");
    });

    test("An import fails when a destination secret key is not a valid Infisical secret key", async () => {
      fakeParameterStore.at(REGION, pathFor("import-invalid-name")).seed({ "not a valid key": "destination-value" });

      const { secretSync } = await newSync("import-invalid-name", { secretPath: "/services" });
      const { secretSync: imported } = await importSecretsForSync({
        syncId: secretSync!.id,
        importBehavior: "prioritize-source",
        authToken: jwtAuthToken
      });

      expect(imported!.importStatus).toBe(SecretSyncStatus.Failed);
      expect(imported!.lastImportMessage).toContain("invalid secret name");
      expect(await secretKeysAt("/services")).toEqual({});
    });
  });

  describe("Removing secrets clears the destination and leaves Infisical unchanged", () => {
    test("A remove clears the sync's secrets from the destination", async () => {
      await addSecret("/services", "API_KEY", "api-value");

      const { secretSync } = await newSync("remove-clears", { secretPath: "/services" });
      await triggerSecretSync({
        syncId: secretSync!.id,
        region: REGION,
        destinationPath: pathFor("remove-clears"),
        authToken: jwtAuthToken
      });
      expect(fakeParameterStore.at(REGION, pathFor("remove-clears")).read()).toEqual({ API_KEY: "api-value" });

      const removed = await removeSecretsForSync({ syncId: secretSync!.id, authToken: jwtAuthToken });

      expect(removed.removeStatus).toBe(SecretSyncStatus.Succeeded);
      expect(fakeParameterStore.at(REGION, pathFor("remove-clears")).read()).toEqual({});
      expect(await secretKeysAt("/services")).toEqual({ API_KEY: "api-value" });

      await removeSecret("/services", "API_KEY");
    });
  });

  describe("Automatic syncing is triggered by changes at the source secret path only", () => {
    test("Creating a secret at the source secret path triggers a sync run", async () => {
      const destinationPath = pathFor("auto-sync-source");
      const { secretSync } = await newSync("auto-sync-source", {
        secretPath: "/services",
        isAutoSyncEnabled: true
      });

      // Creating the sync with auto sync on already queues one run; wait it out so the run this
      // test cares about is the one the secret write causes.
      await triggerSecretSync({ syncId: secretSync!.id, region: REGION, destinationPath, authToken: jwtAuthToken });
      const runCountBefore = fakeParameterStore.at(REGION, destinationPath).runCount();

      await addSecret("/services", "NEW_KEY", "new-value");

      await triggerSecretSync({ syncId: secretSync!.id, region: REGION, destinationPath, authToken: jwtAuthToken });
      expect(fakeParameterStore.at(REGION, destinationPath).runCount()).toBeGreaterThan(runCountBefore);
      expect(fakeParameterStore.at(REGION, destinationPath).read()).toEqual({ NEW_KEY: "new-value" });

      await removeSecret("/services", "NEW_KEY");
    });

    // The second pin for recursive syncing: today a child folder write reaches nothing.
    test("Creating a secret in a child secret path does not trigger a sync run", async () => {
      const destinationPath = pathFor("auto-sync-child");
      await addSecret("/services", "PARENT_KEY", "parent-value");

      const { secretSync } = await newSync("auto-sync-child", {
        secretPath: "/services",
        isAutoSyncEnabled: true
      });
      await triggerSecretSync({ syncId: secretSync!.id, region: REGION, destinationPath, authToken: jwtAuthToken });
      const runCountBefore = fakeParameterStore.at(REGION, destinationPath).runCount();

      await addSecret("/services/api", "CHILD_KEY", "child-value");

      await expectNoSyncRun({ region: REGION, destinationPath, runCountBefore });
      expect(fakeParameterStore.at(REGION, destinationPath).read()).toEqual({ PARENT_KEY: "parent-value" });

      await removeSecret("/services", "PARENT_KEY");
      await removeSecret("/services/api", "CHILD_KEY");
    });

    test("A change at the source secret path does not trigger a sync run when the auto sync parameter is false", async () => {
      const destinationPath = pathFor("auto-sync-off");
      await newSync("auto-sync-off", { secretPath: "/services", isAutoSyncEnabled: false });

      await addSecret("/services", "NEW_KEY", "new-value");

      await expectNoSyncRun({ region: REGION, destinationPath, runCountBefore: 0 });
      expect(fakeParameterStore.at(REGION, destinationPath).read()).toEqual({});

      await removeSecret("/services", "NEW_KEY");
    });
  });

  describe("A failed sync run is reported on the sync and changes nothing", () => {
    test("A destination failure marks the sync failed and records the reason", async () => {
      const destinationPath = pathFor("destination-rejects");
      await addSecret("/services", "API_KEY", "api-value");
      fakeParameterStore.at(REGION, destinationPath).rejectWritesWith("Destination refused the write");

      const { secretSync } = await newSync("destination-rejects", { secretPath: "/services" });
      const sync = await triggerSecretSync({
        syncId: secretSync!.id,
        region: REGION,
        destinationPath,
        authToken: jwtAuthToken
      });

      expect(sync.syncStatus).toBe(SecretSyncStatus.Failed);
      expect(sync.lastSyncMessage).toContain("Destination refused the write");
      expect(await secretKeysAt("/services")).toEqual({ API_KEY: "api-value" });

      await removeSecret("/services", "API_KEY");
    });

    test("A sync whose source secret path no longer exists fails with a message naming the source", async () => {
      const destinationPath = pathFor("source-path-gone");
      const folder = await createFolder({
        authToken: jwtAuthToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        name: "doomed"
      });
      await addSecret("/doomed", "API_KEY", "api-value");

      const { secretSync } = await newSync("source-path-gone", { secretPath: "/doomed" });
      await triggerSecretSync({ syncId: secretSync!.id, region: REGION, destinationPath, authToken: jwtAuthToken });

      await deleteFolder({
        authToken: jwtAuthToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath: "/",
        id: folder.id
      });

      const res = await testServer.inject({
        method: "POST",
        url: `/api/v1/secret-syncs/aws-parameter-store/${secretSync!.id}/sync-secrets`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      // The source folder is gone, so the trigger itself refuses rather than queueing a run
      // that could not resolve a source.
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("folder no longer exists");
    });
  });

  describe("A sync is created against one existing source secret path and one matching connection", () => {
    test("Creating a sync for a secret path that does not exist fails", async () => {
      const { error } = await newSync("missing-source-path", {
        secretPath: "/does/not/exist",
        expectStatusCode: 400
      });

      expect(error!.message).toContain("/does/not/exist");
      expect(error!.message).toContain(ENV);
    });
  });
});
