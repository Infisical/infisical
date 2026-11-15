import { SecretType, TableName } from "@app/db/schemas";
import { FolderModifiedEventV1 } from "@app/services/secret-folder/secret-folder-events";
import { SecretImportModifiedEventV1 } from "@app/services/secret-import/secret-import-events";
import { SecretModifiedEventV1 } from "@app/services/secret-v2-bridge/secret-events";

import { SECRET_EVENTS_RECORDER } from "../../fakes/event-outbox-registry";
import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { createFolder, deleteFolder } from "../../testUtils/folders";
import { createSecretImport, deleteSecretImport } from "../../testUtils/secret-imports";
import { createSecretV2, deleteSecretV2, updateSecretV2 } from "../../testUtils/secrets";

type TRecordedEvent = {
  eventType: string;
  payload: { projectId: string; environment: string; secretPath: string; modificationType: string } & Record<
    string,
    unknown
  >;
};

// No API exposes outbox rows, so read them straight from the table. The recorder consumer in
// fakes/event-outbox-registry.ts is what makes emit write them at all.
const recordedEvents = async (projectId: string, eventType?: string): Promise<TRecordedEvent[]> => {
  const query = testDb(TableName.EventOutbox)
    .where({ consumer: SECRET_EVENTS_RECORDER })
    .whereRaw(`payload->>'projectId' = ?`, [projectId])
    .orderBy("id");
  if (eventType) void query.where({ eventType });
  const rows = await query.select("eventType", "payload");
  return rows as TRecordedEvent[];
};

const changesOf = (events: TRecordedEvent[]) =>
  events.map(({ payload }) => `${payload.modificationType} ${payload.environment}:${payload.secretPath}`);

describe("Secret, folder and import events", () => {
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectId, authToken, cleanup } = await createIsolatedOrgAndProject("secret-events"));
  });

  afterEach(async () => {
    await cleanup();
  });

  const createInFolder = (secretPath: string, key: string, value = "value") =>
    createSecretV2({ workspaceId: projectId, environmentSlug: "dev", secretPath, key, value, authToken });

  test("a single create, update and delete each emit secret.modified for the secret", async () => {
    const secret = await createInFolder("/", "SINGLE");
    await updateSecretV2({
      workspaceId: projectId,
      environmentSlug: "dev",
      secretPath: "/",
      key: "SINGLE",
      value: "changed",
      authToken
    });
    await deleteSecretV2({ workspaceId: projectId, environmentSlug: "dev", secretPath: "/", key: "SINGLE", authToken });

    const events = await recordedEvents(projectId, SecretModifiedEventV1.type);
    expect(events.map(({ payload }) => payload)).toEqual(
      ["created", "updated", "deleted"].map((modificationType) => ({
        secretId: secret.id,
        projectId,
        environment: "dev",
        secretPath: "/",
        modificationType
      }))
    );
  });

  test("a personal override emits nothing", async () => {
    await createInFolder("/", "SHARED");
    const before = await recordedEvents(projectId);

    await createSecretV2({
      workspaceId: projectId,
      environmentSlug: "dev",
      secretPath: "/",
      key: "SHARED",
      value: "mine",
      type: SecretType.Personal,
      authToken
    });

    expect(await recordedEvents(projectId)).toHaveLength(before.length);
  });

  test("a bulk create emits one event per secret", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v4/secrets/batch",
      headers: { authorization: `Bearer ${authToken}` },
      body: {
        projectId,
        environment: "dev",
        secretPath: "/",
        secrets: ["BULK_A", "BULK_B", "BULK_C"].map((secretKey) => ({ secretKey, secretValue: "value" }))
      }
    });
    expect(res.statusCode).toBe(200);

    const events = await recordedEvents(projectId, SecretModifiedEventV1.type);
    expect(events).toHaveLength(3);
    expect(new Set(events.map(({ payload }) => payload.secretId)).size).toBe(3);
  });

  // The batch route accepts a path without a leading slash and resolves it to the same folder.
  test.each(["app", "app/", "/app//"])(
    "a bulk create at '%s' reports the folder's canonical path",
    async (secretPath) => {
      await createFolder({ workspaceId: projectId, environmentSlug: "dev", secretPath: "/", name: "app", authToken });

      const res = await testServer.inject({
        method: "POST",
        url: "/api/v4/secrets/batch",
        headers: { authorization: `Bearer ${authToken}` },
        body: {
          projectId,
          environment: "dev",
          secretPath,
          secrets: [{ secretKey: "UNNORMALIZED", secretValue: "value" }]
        }
      });
      expect(res.statusCode).toBe(200);

      expect(changesOf(await recordedEvents(projectId, SecretModifiedEventV1.type))).toEqual(["created dev:/app"]);
    }
  );

  // A move recreates the secret under a new id, so the original is deleted and the copy created.
  test("a move emits deleted at the source and created at the destination", async () => {
    await createFolder({ workspaceId: projectId, environmentSlug: "dev", secretPath: "/", name: "target", authToken });
    const secret = await createInFolder("/", "MOVED");
    const createdCount = (await recordedEvents(projectId, SecretModifiedEventV1.type)).length;

    const res = await testServer.inject({
      method: "POST",
      url: "/api/v4/secrets/move",
      headers: { authorization: `Bearer ${authToken}` },
      body: {
        projectId,
        sourceEnvironment: "dev",
        sourceSecretPath: "/",
        destinationEnvironment: "dev",
        destinationSecretPath: "/target",
        secretIds: [secret.id]
      }
    });
    expect(res.statusCode).toBe(200);

    const moveEvents = (await recordedEvents(projectId, SecretModifiedEventV1.type)).slice(createdCount);
    expect(changesOf(moveEvents).sort()).toEqual(["created dev:/target", "deleted dev:/"]);
    expect(moveEvents.find(({ payload }) => payload.modificationType === "deleted")?.payload.secretId).toBe(secret.id);
  });

  test("renaming a referenced secret emits for the secret in another folder that references it", async () => {
    await createFolder({ workspaceId: projectId, environmentSlug: "dev", secretPath: "/", name: "app", authToken });
    await createInFolder("/", "DB_HOST", "db.internal");
    const referencing = await createInFolder("/app", "DB_URL", `postgres://\${dev.DB_HOST}`);
    const before = (await recordedEvents(projectId, SecretModifiedEventV1.type)).length;

    await updateSecretV2({
      workspaceId: projectId,
      environmentSlug: "dev",
      secretPath: "/",
      key: "DB_HOST",
      newKey: "DATABASE_HOST",
      authToken
    });

    const renameEvents = (await recordedEvents(projectId, SecretModifiedEventV1.type)).slice(before);
    expect(renameEvents.map(({ payload }) => payload)).toContainEqual({
      secretId: referencing.id,
      projectId,
      environment: "dev",
      secretPath: "/app",
      modificationType: "updated"
    });
  });

  test("a point-in-time rollback emits for the secrets it removes", async () => {
    await createInFolder("/", "KEPT");
    const commitsRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/pit/commits?projectId=${projectId}&environment=dev&path=/&sort=desc`,
      headers: { authorization: `Bearer ${authToken}` }
    });
    expect(commitsRes.statusCode).toBe(200);
    const [targetCommit] = commitsRes.json<{ commits: { id: string; folderId: string }[] }>().commits;

    const rolledBack = await createInFolder("/", "ROLLED_BACK");
    const before = (await recordedEvents(projectId, SecretModifiedEventV1.type)).length;

    const rollbackRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/pit/commits/${targetCommit.id}/rollback`,
      headers: { authorization: `Bearer ${authToken}` },
      body: { projectId, environment: "dev", folderId: targetCommit.folderId }
    });
    expect(rollbackRes.statusCode).toBe(200);

    const rollbackEvents = (await recordedEvents(projectId, SecretModifiedEventV1.type)).slice(before);
    expect(rollbackEvents.map(({ payload }) => payload)).toContainEqual({
      secretId: rolledBack.id,
      projectId,
      environment: "dev",
      secretPath: "/",
      modificationType: "deleted"
    });
  });

  test("folder create, rename and delete each emit folder.modified, a rename carrying its old path", async () => {
    // The intermediate "/parent" is created by the same request, and emits too.
    const folder = await createFolder({
      workspaceId: projectId,
      environmentSlug: "dev",
      secretPath: "/parent",
      name: "child",
      authToken
    });
    expect(changesOf(await recordedEvents(projectId, FolderModifiedEventV1.type))).toEqual([
      "created dev:/parent",
      "created dev:/parent/child"
    ]);

    const renameRes = await testServer.inject({
      method: "PATCH",
      url: `/api/v2/folders/${folder.id}`,
      headers: { authorization: `Bearer ${authToken}` },
      body: { projectId, environment: "dev", path: "/parent", name: "renamed" }
    });
    expect(renameRes.statusCode).toBe(200);
    expect(
      (await recordedEvents(projectId, FolderModifiedEventV1.type)).slice(2).map(({ payload }) => payload)
    ).toEqual([
      {
        folderId: folder.id,
        projectId,
        environment: "dev",
        secretPath: "/parent/renamed",
        modificationType: "updated",
        previous: { secretPath: "/parent/child" }
      }
    ]);

    await deleteFolder({
      workspaceId: projectId,
      environmentSlug: "dev",
      secretPath: "/parent",
      id: folder.id,
      authToken
    });
    const events = await recordedEvents(projectId, FolderModifiedEventV1.type);
    expect(events[events.length - 1].payload).toEqual({
      folderId: folder.id,
      projectId,
      environment: "dev",
      secretPath: "/parent/renamed",
      modificationType: "deleted"
    });
  });

  // A move recreates the folder under a new id, like a secret move.
  test("a folder move emits created for the new folder and deleted for the source", async () => {
    await createFolder({
      workspaceId: projectId,
      environmentSlug: "dev",
      secretPath: "/",
      name: "destination",
      authToken
    });
    const folder = await createFolder({
      workspaceId: projectId,
      environmentSlug: "dev",
      secretPath: "/",
      name: "source",
      authToken
    });
    const before = (await recordedEvents(projectId, FolderModifiedEventV1.type)).length;

    const res = await testServer.inject({
      method: "POST",
      url: "/api/v2/folders/move",
      headers: { authorization: `Bearer ${authToken}` },
      body: { projectId, folderId: folder.id, destinationEnvironment: "dev", destinationPath: "/destination" }
    });
    expect(res.statusCode).toBe(200);

    const moveEvents = (await recordedEvents(projectId, FolderModifiedEventV1.type)).slice(before);
    expect(changesOf(moveEvents).sort()).toEqual(["created dev:/destination/source", "deleted dev:/source"]);
  });

  test("import create, update and delete emit secret-import.modified for the folder holding the import", async () => {
    await createFolder({ workspaceId: projectId, environmentSlug: "dev", secretPath: "/", name: "shared", authToken });
    const secretImport = await createSecretImport({
      workspaceId: projectId,
      environmentSlug: "staging",
      secretPath: "/",
      importEnv: "dev",
      importPath: "/shared",
      authToken
    });

    const updateRes = await testServer.inject({
      method: "PATCH",
      url: `/api/v2/secret-imports/${secretImport.id}`,
      headers: { authorization: `Bearer ${authToken}` },
      body: { projectId, environment: "staging", path: "/", import: { path: "/" } }
    });
    expect(updateRes.statusCode).toBe(200);

    await deleteSecretImport({
      workspaceId: projectId,
      environmentSlug: "staging",
      secretPath: "/",
      id: secretImport.id,
      authToken
    });

    const events = await recordedEvents(projectId, SecretImportModifiedEventV1.type);
    expect(events.map(({ payload }) => payload)).toEqual(
      ["created", "updated", "deleted"].map((modificationType) => ({
        secretImportId: secretImport.id,
        projectId,
        environment: "staging",
        secretPath: "/",
        modificationType
      }))
    );
  });
});
