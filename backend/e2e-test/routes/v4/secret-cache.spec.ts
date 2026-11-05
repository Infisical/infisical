import { Redis } from "ioredis";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { SECRET_MANAGER_CACHE_PREFIX } from "@app/keystore/keystore";

import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { createFolder } from "../../testUtils/folders";
import { createSecretImport } from "../../testUtils/secret-imports";
import { createSecretV2 } from "../../testUtils/secrets";

// Against the real Redis the e2e environment boots, so the entry a miss writes is the compressed,
// encrypted bytes a hit has to read back.
declare const testRedis: Redis;

const listSecrets = (dto: { projectId: string; authToken: string; includeImports: boolean; ifNoneMatch?: string }) =>
  testServer.inject({
    method: "GET",
    url: "/api/v4/secrets",
    headers: {
      authorization: `Bearer ${dto.authToken}`,
      ...(dto.ifNoneMatch ? { "if-none-match": dto.ifNoneMatch } : {})
    },
    query: {
      projectId: dto.projectId,
      environment: "dev",
      secretPath: "/app",
      viewSecretValue: "true",
      includeImports: String(dto.includeImports)
    }
  });

const cachedListKeys = (projectId: string) =>
  testRedis.keys(`${SECRET_MANAGER_CACHE_PREFIX}:${projectId}:*get-secrets-service-layer-zstd:*`);

// Deleting the row directly skips cache invalidation, so only a response served from the cache still has it.
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

const secretKeys = (payload: { secrets: { secretKey: string }[] }) => payload.secrets.map((s) => s.secretKey).sort();

describe("Secret list cache", () => {
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectId, authToken, cleanup } = await createIsolatedOrgAndProject("secret-cache"));

    await Promise.all(
      ["app", "shared"].map((name) =>
        createFolder({ workspaceId: projectId, environmentSlug: "dev", secretPath: "/", name, authToken })
      )
    );
    const secrets: { secretPath: string; key: string; value: string }[] = [
      { secretPath: "/app", key: "PLAIN", value: "postgres://svc:pa55@db.internal:5432/app" },
      { secretPath: "/app", key: "UNICODE", value: 'héllo wörld ✓ 日本語 🚀 "quoted" \\backslash' },
      { secretPath: "/app", key: "MULTILINE", value: "line one\nline two\n\tindented" },
      { secretPath: "/app", key: "PROBE", value: "probe" },
      { secretPath: "/shared", key: "SHARED", value: "from-shared" }
    ];
    await Promise.all(
      secrets.map((secret) => createSecretV2({ workspaceId: projectId, environmentSlug: "dev", authToken, ...secret }))
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

  test.each([true, false])("a hit returns exactly what the miss cached (includeImports=%s)", async (includeImports) => {
    const miss = await listSecrets({ projectId, authToken, includeImports });
    expect(miss.statusCode).toBe(200);
    const etag = miss.headers.etag as string;
    expect(etag).toBeTruthy();
    expect(secretKeys(miss.json())).toEqual(["MULTILINE", "PLAIN", "PROBE", "UNICODE"]);
    if (includeImports) {
      expect(miss.json().imports.flatMap((i: { secrets: { secretKey: string }[] }) => secretKeys(i))).toEqual([
        "SHARED"
      ]);
    }
    expect(await cachedListKeys(projectId)).toHaveLength(1);

    expect(await deleteSecretRowBehindCache(projectId, "app", "PROBE")).toBe(1);

    const hit = await listSecrets({ projectId, authToken, includeImports });
    expect(hit.statusCode).toBe(200);
    expect(secretKeys(hit.json())).toContain("PROBE");
    expect(hit.json()).toEqual(miss.json());
    expect(hit.headers.etag).toBe(etag);

    const notModified = await listSecrets({ projectId, authToken, includeImports, ifNoneMatch: etag });
    expect(notModified.statusCode).toBe(304);
    expect(notModified.payload).toBe("");
  });
});
