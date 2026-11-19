import { Redis } from "ioredis";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { SECRET_MANAGER_CACHE_PREFIX } from "@app/keystore/keystore";

import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { createFolder } from "../../testUtils/folders";
import { createSecretImport } from "../../testUtils/secret-imports";
import { createSecretV2, updateSecretV2 } from "../../testUtils/secrets";

declare const testRedis: Redis;

type TImportedSecretsPayload = {
  secrets: { secrets: { secretKey: string; secretValue: string }[] }[];
};

const IMPORT_ROUTES = [
  { version: "v1", url: "/api/v1/secret-imports/secrets/raw", projectIdParam: "workspaceId" },
  { version: "v2", url: "/api/v2/secret-imports/secrets", projectIdParam: "projectId" }
] as const;

const listImportedSecrets = (dto: {
  route: (typeof IMPORT_ROUTES)[number];
  projectId: string;
  authToken: string;
  ifNoneMatch?: string;
}) =>
  testServer.inject({
    method: "GET",
    url: dto.route.url,
    headers: {
      authorization: `Bearer ${dto.authToken}`,
      ...(dto.ifNoneMatch ? { "if-none-match": dto.ifNoneMatch } : {})
    },
    query: {
      [dto.route.projectIdParam]: dto.projectId,
      environment: "dev",
      path: "/app"
    }
  });

const cachedReadKeys = (projectId: string) =>
  testRedis.keys(`${SECRET_MANAGER_CACHE_PREFIX}:${projectId}:*get-secrets-service-layer-zstd:*`);

const deleteSecretRowBehindCache = (projectId: string, folderName: string, key: string) =>
  testDb(TableName.SecretV2)
    .where({ key })
    .whereIn(
      "folderId",
      testDb(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .where(`${TableName.SecretFolder}.name`, folderName)
        .select(`${TableName.SecretFolder}.id`)
    )
    .delete();

const importedSecrets = (payload: TImportedSecretsPayload) => payload.secrets.flatMap((folder) => folder.secrets);

const importedKeys = (payload: TImportedSecretsPayload) =>
  importedSecrets(payload)
    .map((secret) => secret.secretKey)
    .sort();

describe("Secret imports read cache", () => {
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectId, authToken, cleanup } = await createIsolatedOrgAndProject("secret-import-cache"));

    await Promise.all(
      ["app", "shared"].map((name) =>
        createFolder({ workspaceId: projectId, environmentSlug: "dev", secretPath: "/", name, authToken })
      )
    );
    const secrets: { key: string; value: string }[] = [
      { key: "PLAIN", value: "postgres://svc:pa55@db.internal:5432/app" },
      { key: "UNICODE", value: 'héllo wörld ✓ 日本語 🚀 "quoted" \\backslash' },
      { key: "MULTILINE", value: "line one\nline two\n\tindented" },
      { key: "PROBE", value: "probe" }
    ];
    await Promise.all(
      secrets.map((secret) =>
        createSecretV2({ workspaceId: projectId, environmentSlug: "dev", secretPath: "/shared", authToken, ...secret })
      )
    );
    await createSecretImport({
      workspaceId: projectId,
      environmentSlug: "dev",
      secretPath: "/app",
      importPath: "/shared",
      importEnv: "dev",
      authToken
    });
  });

  afterEach(async () => {
    const keys = await testRedis.keys(`${SECRET_MANAGER_CACHE_PREFIX}:${projectId}:*`);
    if (keys.length) await testRedis.del(...keys);
    await cleanup();
  });

  test.each(IMPORT_ROUTES)("$version: a hit returns exactly what the miss cached", async (route) => {
    const miss = await listImportedSecrets({ route, projectId, authToken });
    expect(miss.statusCode).toBe(200);
    const etag = miss.headers.etag as string;
    expect(etag).toBeTruthy();
    const missPayload: TImportedSecretsPayload = miss.json();
    expect(importedKeys(missPayload)).toEqual(["MULTILINE", "PLAIN", "PROBE", "UNICODE"]);
    expect(await cachedReadKeys(projectId)).toHaveLength(1);

    expect(await deleteSecretRowBehindCache(projectId, "shared", "PROBE")).toBe(1);

    const hit = await listImportedSecrets({ route, projectId, authToken });
    expect(hit.statusCode).toBe(200);
    expect(hit.json()).toEqual(missPayload);
    expect(hit.headers.etag).toBe(etag);

    const notModified = await listImportedSecrets({ route, projectId, authToken, ifNoneMatch: etag });
    expect(notModified.statusCode).toBe(304);
    expect(notModified.payload).toBe("");
  });

  test.each(IMPORT_ROUTES)("$version: changing an imported secret invalidates the ETag", async (route) => {
    const first = await listImportedSecrets({ route, projectId, authToken });
    expect(first.statusCode).toBe(200);
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();

    await updateSecretV2({
      workspaceId: projectId,
      environmentSlug: "dev",
      secretPath: "/shared",
      key: "PLAIN",
      value: "rotated",
      authToken
    });

    const second = await listImportedSecrets({ route, projectId, authToken, ifNoneMatch: etag });
    expect(second.statusCode).toBe(200);
    expect(second.headers.etag).toBeTruthy();
    expect(second.headers.etag).not.toBe(etag);
    const secondPayload: TImportedSecretsPayload = second.json();
    expect(importedSecrets(secondPayload).find((secret) => secret.secretKey === "PLAIN")?.secretValue).toBe("rotated");
  });
});
