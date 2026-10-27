import { randomUUID } from "crypto";
import { fakeParameterStore } from "e2e-test/fakes/aws-parameter-store-sync-fns";
import { createAwsAppConnection, deleteAwsAppConnection } from "e2e-test/testUtils/app-connections";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createFolder } from "e2e-test/testUtils/folders";
import {
  createSecretSync,
  deleteSecretSync,
  importSecretsForSync,
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
  // A sync run is a queue round trip, so it takes longer than the 5s default. The helpers give
  // up after 20s of their own, and this has to outlast that or the test dies first and reports
  // a timeout instead of whatever the sync actually did.
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  let projectId: string;
  let authToken: string;
  let cleanupOrg: () => Promise<void>;
  let connectionId: string;
  let createdSyncIds: string[] = [];

  const newFolder = (parentPath: string, name: string) =>
    createFolder({
      authToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: parentPath,
      name
    });

  const addSecret = (secretPath: string, key: string, value: string) =>
    createSecretV2({ authToken, workspaceId: projectId, environmentSlug: ENV, secretPath, key, value });

  const removeSecret = (secretPath: string, key: string) =>
    deleteSecretV2({ authToken, workspaceId: projectId, environmentSlug: ENV, secretPath, key });

  const secretKeysAt = async (secretPath: string) => {
    const { secrets } = await getSecretsV2({
      authToken,
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
      authToken,
      ...overrides
    });

    // Tracked so afterEach can clear them before the connection. Absent when a test asserts
    // that creation is refused.
    if (result.secretSync) createdSyncIds.push(result.secretSync.id);

    return result;
  };

  // Everything a test touches is built here and torn down after it, so no test can be reached by
  // another's writes or teardown. That matters more than usual for secret syncs: auto sync reacts
  // to any write at a sync's source path, secret imports outlive the test that made them, and an
  // app connection is org-scoped rather than project-scoped, so sharing one would leave a single
  // row that every test's syncs hang off. A fresh org per test (not just a fresh project) closes
  // that off completely rather than relying on the shared seeded org staying tidy.
  beforeEach(async () => {
    fakeParameterStore.reset();
    createdSyncIds = [];

    ({ projectId, authToken, cleanup: cleanupOrg } = await createIsolatedOrgAndProject("secret-sync-e2e"));

    connectionId = await createAwsAppConnection({
      name: `secret-sync-e2e-${randomUUID().slice(0, 8)}`,
      authToken
    });

    await newFolder("/", "services");
    await newFolder("/services", "api");
  });

  afterEach(async () => {
    // Order matters. A sync holds a foreign key to the connection, and deleting a project only
    // soft deletes it, leaving the sync rows in place, so the connection delete would fail on the
    // constraint if the syncs went second.
    for (const syncId of createdSyncIds) {
      // eslint-disable-next-line no-await-in-loop
      await deleteSecretSync({ syncId, authToken });
    }

    await deleteAwsAppConnection({ connectionId, authToken });
    await cleanupOrg();
  });

  describe("The initial sync behavior decides what happens to secrets already at the destination", () => {
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
        authToken
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
        authToken
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
        authToken
      });

      // Arrives at the destination outside Infisical, after the first run has happened.
      fakeParameterStore.at(REGION, pathFor("first-run-only")).seed({ LATE_KEY: "late-value" });

      await triggerSecretSync({
        syncId: secretSync!.id,
        region: REGION,
        destinationPath: pathFor("first-run-only"),
        authToken
      });

      expect(await secretKeysAt("/services")).toEqual({ API_KEY: "api-value" });
      expect(fakeParameterStore.at(REGION, pathFor("first-run-only")).read()).toEqual({ API_KEY: "api-value" });

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
        authToken
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
        authToken
      });

      expect(await secretKeysAt("/services")).toEqual({ API_KEY: "destination-value" });

      await removeSecret("/services", "API_KEY");
    });

    test("An import fails when a destination secret key is not a valid Infisical secret key", async () => {
      // SecretNameSchema rejects only a colon or a forward slash, so a name with spaces would
      // import cleanly. This has to be one Infisical genuinely refuses.
      fakeParameterStore.at(REGION, pathFor("import-invalid-name")).seed({ "BAD:KEY": "destination-value" });

      const { secretSync } = await newSync("import-invalid-name", { secretPath: "/services" });
      const { secretSync: imported } = await importSecretsForSync({
        syncId: secretSync!.id,
        importBehavior: "prioritize-source",
        authToken
      });

      expect(imported!.importStatus).toBe(SecretSyncStatus.Failed);
      expect(imported!.lastImportMessage).toContain("invalid secret name");
      expect(await secretKeysAt("/services")).toEqual({});
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
        authToken
      });

      expect(sync.syncStatus).toBe(SecretSyncStatus.Failed);
      expect(sync.lastSyncMessage).toContain("Destination refused the write");
      expect(await secretKeysAt("/services")).toEqual({ API_KEY: "api-value" });

      await removeSecret("/services", "API_KEY");
    });
  });
});
