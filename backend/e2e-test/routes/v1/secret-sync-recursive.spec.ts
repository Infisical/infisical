import { randomUUID } from "node:crypto";

import { fakeParameterStore } from "e2e-test/fakes/aws-parameter-store-sync-fns";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { addIdentityToProject, createIdentityActor, grantIdentityFolderAccess } from "e2e-test/testUtils/identities";
import {
  createAwsAppConnection,
  createSecretSync,
  expectDestinationUnchanged,
  getSecretSync,
  listSecretSyncs,
  setAutoSync,
  updateSecretSync,
  waitForDestinationSecrets,
  waitForSyncRun
} from "e2e-test/testUtils/secret-syncs";
import { createSecretV2 } from "e2e-test/testUtils/secrets";

import { ProjectMembershipRole, SecretFolderRole } from "@app/db/schemas";
import { initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { SecretSyncInitialSyncBehavior } from "@app/services/secret-sync/secret-sync-enums";

const ENV = "dev";
const REGION = "us-east-1";

// Each group owns an org of its own (createIsolatedOrgAndProject), so its folders, secrets,
// memberships and syncs cannot reach another group's, and tearing it down is one org delete.

describe("A secret sync is refused when it would read a folder the actor cannot", async () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  // The sync worker reads every folder a sync covers with authorization disabled (canExpandValue
  // and hasSecretAccess both return true), so create and update are the only gate. A folder grant
  // is what makes the escalation reachable: it can give an actor read on a parent folder while
  // the base project role denies every child.

  let orgId: string;
  let projectId: string;
  let adminToken: string;
  let cleanupOrg: () => Promise<void>;
  let connectionId: string;
  let actorToken: string;

  const newSync = (dto: { name: string; includeAllSubFolders: boolean; expectStatusCode?: number }) =>
    createSecretSync({
      name: dto.name,
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: "/backend",
      region: REGION,
      destinationPath: `/${dto.name}/`,
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      includeAllSubFolders: dto.includeAllSubFolders,
      isAutoSyncEnabled: false,
      authToken: actorToken,
      expectStatusCode: dto.expectStatusCode
    });

  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);

    ({
      orgId,
      projectId,
      authToken: adminToken,
      cleanup: cleanupOrg
    } = await createIsolatedOrgAndProject("secret-sync-recursive-perms"));

    connectionId = await createAwsAppConnection({
      name: `secret-sync-recursive-perms-${randomUUID().slice(0, 8)}`,
      authToken: adminToken
    });

    for (const folder of [
      { secretPath: "/", name: "backend" },
      { secretPath: "/backend", name: "api" }
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await createFolder({
        authToken: adminToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        ...folder
      });
    }

    for (const secret of [
      { secretPath: "/backend", key: "BACKEND_KEY", value: "backend-value" },
      { secretPath: "/backend/api", key: "API_KEY", value: "api-value" }
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await createSecretV2({
        authToken: adminToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        ...secret
      });
    }

    const actor = await createIdentityActor({ orgId, authToken: adminToken });
    actorToken = actor.authToken;

    // The base role grants nothing, so every folder the grant below does not name is denied.
    await addIdentityToProject({
      projectId,
      identityId: actor.identityId,
      role: ProjectMembershipRole.NoAccess,
      authToken: adminToken
    });

    // Manage is the lowest tier carrying secret sync create, and a folder grant applies to the
    // named folder only, so "/backend/api" falls back to the no-access base role.
    await grantIdentityFolderAccess({
      projectId,
      identityId: actor.identityId,
      environmentSlug: ENV,
      secretPath: "/backend",
      permission: SecretFolderRole.Manage,
      authToken: adminToken
    });
  });

  afterAll(async () => {
    await cleanupOrg();
  });

  test("creating a sync that includes subfolders is refused, naming the folder that is denied", async () => {
    const { error } = await newSync({ name: "recursive-denied", includeAllSubFolders: true, expectStatusCode: 403 });

    expect(error.message).toContain("/backend/api");
  });

  test("repointing an existing recursive sync at another destination is refused", async () => {
    // The admin can read the whole subtree, so this sync is legitimate at the moment it is made.
    // The Manage grant then gives the actor Edit on it, scoped to "/backend", while leaving
    // "/backend/api" denied. Without a check on this path the actor sends the denied folder to a
    // destination of their choosing without ever touching the sync's source.
    const { secretSync } = await createSecretSync({
      name: "recursive-created-by-admin",
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: "/backend",
      region: REGION,
      destinationPath: "/recursive-created-by-admin/",
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      includeAllSubFolders: true,
      isAutoSyncEnabled: false,
      authToken: adminToken
    });

    const { error } = await updateSecretSync({
      syncId: secretSync!.id,
      body: { destinationConfig: { region: REGION, path: "/actor-controlled/" } },
      authToken: actorToken,
      expectStatusCode: 403
    });

    expect(error.message).toContain("/backend/api");
  });

  test("turning subfolders on for an existing sync is refused", async () => {
    const { secretSync } = await newSync({ name: "recursive-turned-on-later", includeAllSubFolders: false });

    const { error } = await updateSecretSync({
      syncId: secretSync!.id,
      body: {
        syncOptions: {
          initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
          includeAllSubFolders: true
        }
      },
      authToken: actorToken,
      expectStatusCode: 403
    });

    expect(error.message).toContain("/backend/api");
  });
});

describe("A recursive secret sync is refused when two folders use the same secret name", async () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  // A destination that stores secrets in one flat list cannot hold the same name twice, so a
  // recursive sync whose subtree reuses a name is broken from the moment it is saved. The
  // job-time check still exists for the sync that only clashes later.

  let projectId: string;
  let adminToken: string;
  let cleanupOrg: () => Promise<void>;
  let connectionId: string;

  const newSync = (dto: { name: string; includeAllSubFolders: boolean; expectStatusCode?: number }) =>
    createSecretSync({
      name: dto.name,
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: "/backend",
      region: REGION,
      destinationPath: `/${dto.name}/`,
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      includeAllSubFolders: dto.includeAllSubFolders,
      isAutoSyncEnabled: false,
      authToken: adminToken,
      expectStatusCode: dto.expectStatusCode
    });

  // Creating a recursive sync over an existing collision is refused, so the only way one can be
  // holding a collision is for the second name to have appeared after it was saved. The update
  // tests all need a sync in that state, so they build it the same way: a recursive sync over a
  // subtree that is still clean, then the colliding name written into both of its folders.
  const recursiveSyncWithLateCollision = async (dto: { name: string; folder: string }) => {
    for (const folder of [
      { secretPath: "/", name: dto.folder },
      { secretPath: `/${dto.folder}`, name: "child" }
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await createFolder({
        authToken: adminToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        ...folder
      });
    }

    const { secretSync } = await createSecretSync({
      name: dto.name,
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: `/${dto.folder}`,
      region: REGION,
      destinationPath: `/${dto.name}/`,
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      includeAllSubFolders: true,
      isAutoSyncEnabled: false,
      authToken: adminToken
    });

    for (const secretPath of [`/${dto.folder}`, `/${dto.folder}/child`]) {
      // eslint-disable-next-line no-await-in-loop
      await createSecretV2({
        authToken: adminToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath,
        key: "LATE_KEY",
        value: `value-for-${secretPath}`
      });
    }

    return secretSync!;
  };

  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);

    ({
      projectId,
      authToken: adminToken,
      cleanup: cleanupOrg
    } = await createIsolatedOrgAndProject("secret-sync-recursive-dupes"));

    connectionId = await createAwsAppConnection({
      name: `secret-sync-recursive-dupes-${randomUUID().slice(0, 8)}`,
      authToken: adminToken
    });

    for (const folder of [
      { secretPath: "/", name: "backend" },
      { secretPath: "/backend", name: "api" }
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await createFolder({
        authToken: adminToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        ...folder
      });
    }

    for (const secretPath of ["/backend", "/backend/api"]) {
      // eslint-disable-next-line no-await-in-loop
      await createSecretV2({
        authToken: adminToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        secretPath,
        key: "DB_URL",
        value: `postgres:/${secretPath}`
      });
    }
  });

  afterAll(async () => {
    await cleanupOrg();
  });

  test("creating it is refused, naming the secret and both folders", async () => {
    const { error } = await newSync({ name: "recursive-duplicate", includeAllSubFolders: true, expectStatusCode: 400 });

    expect(error.message).toContain("DB_URL");
    expect(error.message).toContain("/backend");
    expect(error.message).toContain("/backend/api");
  });

  test("the refused request leaves no sync behind", async () => {
    const secretSyncs = await listSecretSyncs({ projectId, authToken: adminToken });

    expect(secretSyncs.map((sync) => sync.name)).not.toContain("recursive-duplicate");
  });

  // The two tests below pin the same rule from opposite sides: the checks an update runs read the
  // sync options that update is about to store. Reading the request alone misses that an absent
  // syncOptions leaves the stored ones in place; reading the stored row alone misses that a
  // supplied syncOptions replaces them outright.

  test("turning subfolders off is allowed even though the subtree collides", async () => {
    const secretSync = await recursiveSyncWithLateCollision({
      name: "recursive-turned-off-later",
      folder: "reports"
    });

    await updateSecretSync({
      syncId: secretSync.id,
      body: { syncOptions: { initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination } },
      authToken: adminToken
    });

    const updated = await getSecretSync({ syncId: secretSync.id, authToken: adminToken });

    expect(updated.syncOptions.includeAllSubFolders).toBeFalsy();
  });

  test("an update that leaves the sync options alone is still checked as recursive", async () => {
    const secretSync = await recursiveSyncWithLateCollision({
      name: "recursive-left-alone",
      folder: "metrics"
    });

    const { error } = await updateSecretSync({
      syncId: secretSync.id,
      body: { name: "recursive-left-alone-renamed" },
      authToken: adminToken,
      expectStatusCode: 400
    });

    expect(error.message).toContain("LATE_KEY");
    expect(error.message).toContain("/metrics");
    expect(error.message).toContain("/metrics/child");
  });

  test("turning subfolders on for an existing sync is refused", async () => {
    const { secretSync } = await newSync({ name: "recursive-turned-on-later", includeAllSubFolders: false });

    const { error } = await updateSecretSync({
      syncId: secretSync!.id,
      body: {
        syncOptions: {
          initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
          includeAllSubFolders: true
        }
      },
      authToken: adminToken,
      expectStatusCode: 400
    });

    expect(error.message).toContain("DB_URL");
    expect(error.message).toContain("/backend/api");
  });
});

describe("A change in a subfolder reaches the recursive sync above it", async () => {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

  // Each test waits for the auto-sync-enable run to finish (via waitForSyncRun) before writing the
  // subfolder secret. Skipping that wait would let the enable-time run, which always resolves the
  // full recursive subtree at whatever the DB holds when it executes, pick up the later write by
  // coincidence and mask a missing trigger.

  let projectId: string;
  let adminToken: string;
  let cleanupOrg: () => Promise<void>;
  let connectionId: string;

  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);

    ({
      projectId,
      authToken: adminToken,
      cleanup: cleanupOrg
    } = await createIsolatedOrgAndProject("secret-sync-recursive-trigger"));

    connectionId = await createAwsAppConnection({
      name: `secret-sync-recursive-trigger-${randomUUID().slice(0, 8)}`,
      authToken: adminToken
    });

    for (const folder of [
      { secretPath: "/", name: "backend" },
      { secretPath: "/backend", name: "api" }
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await createFolder({
        authToken: adminToken,
        workspaceId: projectId,
        environmentSlug: ENV,
        ...folder
      });
    }
  });

  afterAll(async () => {
    await cleanupOrg();
  });

  test("a write at a subfolder reaches the recursive sync rooted above it", async () => {
    const destinationPath = "/recursive-trigger-target/";

    const { secretSync } = await createSecretSync({
      name: "recursive-trigger",
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: "/backend",
      region: REGION,
      destinationPath,
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      includeAllSubFolders: true,
      isAutoSyncEnabled: false,
      authToken: adminToken
    });

    const runCountBeforeEnable = fakeParameterStore.at(REGION, destinationPath).runCount();
    await setAutoSync({ syncId: secretSync!.id, isAutoSyncEnabled: true, authToken: adminToken });
    await waitForSyncRun({
      syncId: secretSync!.id,
      region: REGION,
      destinationPath,
      runCountBefore: runCountBeforeEnable,
      authToken: adminToken
    });

    expect(fakeParameterStore.at(REGION, destinationPath).read()).toEqual({});

    await createSecretV2({
      authToken: adminToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/backend/api",
      key: "SUBFOLDER_KEY",
      value: "subfolder-value"
    });

    await waitForDestinationSecrets({
      region: REGION,
      destinationPath,
      expected: { SUBFOLDER_KEY: "subfolder-value" }
    });
  });

  // Deleting a folder takes secrets away from a recursive sync with no secret-level write to carry
  // it, so the trigger has to come from the folder delete itself. Built on its own subtree so the
  // destination holds nothing but this test's secret.
  test("deleting a subfolder removes its secrets from the recursive sync above it", async () => {
    const destinationPath = "/recursive-folder-delete-target/";

    await createFolder({
      authToken: adminToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/",
      name: "audit"
    });
    const reports = await createFolder({
      authToken: adminToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/audit",
      name: "reports"
    });

    await createSecretV2({
      authToken: adminToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/audit/reports",
      key: "AUDIT_KEY",
      value: "audit-value"
    });

    const { secretSync } = await createSecretSync({
      name: "recursive-folder-delete",
      projectId,
      connectionId,
      environmentSlug: ENV,
      secretPath: "/audit",
      region: REGION,
      destinationPath,
      initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
      includeAllSubFolders: true,
      isAutoSyncEnabled: false,
      authToken: adminToken
    });

    await setAutoSync({ syncId: secretSync!.id, isAutoSyncEnabled: true, authToken: adminToken });

    // Wait for the secret to land, then for the destination to go quiet. Enabling auto sync can
    // leave more than one run in flight, and a straggler arriving after the delete would empty the
    // destination for a reason this test would then misread as the delete having triggered a sync.
    await waitForDestinationSecrets({
      region: REGION,
      destinationPath,
      expected: { AUDIT_KEY: "audit-value" }
    });
    await expectDestinationUnchanged({
      region: REGION,
      destinationPath,
      expected: { AUDIT_KEY: "audit-value" }
    });

    const runCountBeforeDelete = fakeParameterStore.at(REGION, destinationPath).runCount();

    // Removes "/audit/reports", leaving the sync on "/audit" in place: the route takes the folder
    // by id and its parent's path, so secretPath here is the parent rather than the target.
    await deleteFolder({
      authToken: adminToken,
      workspaceId: projectId,
      environmentSlug: ENV,
      secretPath: "/audit",
      id: reports.id,
      forceDelete: true
    });

    // A run that starts after the delete, not merely an empty destination: only the delete can have
    // queued it. waitForSyncRun returns once the run has started and the record reports a terminal
    // status, which the previous run already satisfies, so the destination is read by polling rather
    // than immediately.
    await waitForSyncRun({
      syncId: secretSync!.id,
      region: REGION,
      destinationPath,
      runCountBefore: runCountBeforeDelete,
      authToken: adminToken
    });

    await waitForDestinationSecrets({ region: REGION, destinationPath, expected: {} });
  });
});
