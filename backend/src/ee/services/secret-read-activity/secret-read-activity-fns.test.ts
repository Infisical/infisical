import { describe, expect, test } from "vitest";

import { TLastSecretRead } from "@app/ee/services/audit-log/audit-log-dal";
import { ActorType } from "@app/services/auth/auth-type";

import { classifySecretReads, computeSecretReach, indexSecretReads } from "./secret-read-activity-fns";
import { SecretReadStatus, TReachSecret, TSecretReachGraph } from "./secret-read-activity-types";

// prod: /, /app, /app/nested, /shared. dev: /, /consumer (imports prod /app/nested).
const folders: Record<string, { parentId: string | null; environment: string; secretPath: string }> = {
  prodRoot: { parentId: null, environment: "prod", secretPath: "/" },
  app: { parentId: "prodRoot", environment: "prod", secretPath: "/app" },
  nested: { parentId: "app", environment: "prod", secretPath: "/app/nested" },
  shared: { parentId: "prodRoot", environment: "prod", secretPath: "/shared" },
  devRoot: { parentId: null, environment: "dev", secretPath: "/" },
  consumer: { parentId: "devRoot", environment: "dev", secretPath: "/consumer" }
};

const dbPass: TReachSecret = { id: "db-pass", folderId: "shared", key: "DB_PASS" };
const dbUrl: TReachSecret = { id: "db-url", folderId: "shared", key: "DB_URL" };
const connection: TReachSecret = { id: "connection", folderId: "nested", key: "CONNECTION" };

// DB_URL references DB_PASS locally, CONNECTION references DB_URL, and CONNECTION back to DB_PASS closes a cycle.
const referencers: Record<string, TReachSecret[]> = {
  [dbPass.id]: [dbUrl],
  [dbUrl.id]: [connection],
  [connection.id]: [dbPass]
};

const graph: TSecretReachGraph = {
  getReferencers: (secret) => referencers[secret.id] ?? [],
  getImporterFolderIds: (folderId) => (folderId === "nested" ? ["consumer"] : []),
  getParentFolderId: (folderId) => folders[folderId]?.parentId,
  getLocation: (folderId) => folders[folderId]
};

const read = (overrides: Partial<TLastSecretRead>): TLastSecretRead => ({
  actor: ActorType.IDENTITY,
  actorId: "identity-1",
  environment: "prod",
  secretPath: "/shared",
  secretId: null,
  secretKey: null,
  lastReadAt: new Date("2026-10-10T00:00:00.000Z"),
  ...overrides
});

const trackedSince = new Date("2026-10-01T00:00:00.000Z");

describe("computeSecretReach", () => {
  const reach = computeSecretReach(dbPass, graph);

  test("follows references transitively and stops at cycles", () => {
    expect([...reach.secretIds].sort()).toEqual([connection.id, dbPass.id, dbUrl.id].sort());
  });

  test("includes the folders holding referencing secrets and the folders importing them", () => {
    expect([...reach.locations].sort()).toEqual(["dev:/consumer", "prod:/app/nested", "prod:/shared"]);
    expect([...reach.environments].sort()).toEqual(["dev", "prod"]);
  });

  test("lists parent folders separately, never a folder that already returns the secret", () => {
    expect([...reach.parentLocations].sort()).toEqual(["dev:/", "prod:/", "prod:/app"]);
  });
});

describe("classifySecretReads", () => {
  const reach = computeSecretReach(dbPass, graph);
  const classify = (reads: TLastSecretRead[]) =>
    classifySecretReads(indexSecretReads(reads), reach, trackedSince).get(`${ActorType.IDENTITY}:identity-1`);

  test("counts a bulk read of a folder that imports the secret, whatever the path's trailing slash", () => {
    expect(classify([read({ environment: "dev", secretPath: "/consumer/" })])?.status).toBe(SecretReadStatus.Read);
  });

  test("counts a single read of a secret that references it", () => {
    expect(classify([read({ secretPath: "/app/nested", secretId: connection.id })])?.status).toBe(
      SecretReadStatus.Read
    );
  });

  test("ignores a single read of an unrelated secret in the same folder", () => {
    expect(classify([read({ secretId: "unrelated", secretKey: "UNRELATED" })])).toBeUndefined();
  });

  test("counts a single read by name through an import, even when it returned a replicated copy", () => {
    expect(
      classify([
        read({ environment: "dev", secretPath: "/consumer", secretId: "replicated-copy", secretKey: "DB_PASS" })
      ])?.status
    ).toBe(SecretReadStatus.Read);
  });

  test("ignores a single read of a different name in a folder that imports the secret", () => {
    expect(
      classify([read({ environment: "dev", secretPath: "/consumer", secretId: "other", secretKey: "OTHER_KEY" })])
    ).toBeUndefined();
  });

  test("treats a read of a parent folder as a possible read", () => {
    expect(classify([read({ secretPath: "/" })])?.status).toBe(SecretReadStatus.PossiblyRead);
  });

  test("ignores reads from before the secret's path existed", () => {
    expect(classify([read({ lastReadAt: new Date("2026-09-30T00:00:00.000Z") })])).toBeUndefined();
  });

  test("prefers a definite read over a later possible one and keeps the latest of each", () => {
    const latestRead = new Date("2026-10-08T00:00:00.000Z");
    expect(
      classify([
        read({ secretPath: "/", lastReadAt: new Date("2026-10-12T00:00:00.000Z") }),
        read({ lastReadAt: new Date("2026-10-05T00:00:00.000Z") }),
        read({ environment: "dev", secretPath: "/consumer", lastReadAt: latestRead })
      ])
    ).toEqual({
      actorType: ActorType.IDENTITY,
      actorId: "identity-1",
      status: SecretReadStatus.Read,
      lastReadAt: latestRead
    });
  });
});
