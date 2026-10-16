import { describe, expect, test } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";

import {
  classifySecretReads,
  computeSecretReach,
  coversWholeWindow,
  getUtcMonthStart,
  indexSecretReads
} from "./secret-read-activity-fns";
import {
  SecretReadObjectType,
  SecretReadStatus,
  TReachSecret,
  TSecretLastRead,
  TSecretReachGraph
} from "./secret-read-activity-types";

const dbPass: TReachSecret = { id: "db-pass", folderId: "shared", key: "DB_PASS" };
const dbUrl: TReachSecret = { id: "db-url", folderId: "shared", key: "DB_URL" };
const connection: TReachSecret = { id: "connection", folderId: "nested", key: "CONNECTION" };

// DB_URL references DB_PASS locally, CONNECTION references DB_URL, and CONNECTION back to DB_PASS closes a cycle.
// The consumer folder imports the nested folder, and the edge folder imports the consumer folder.
const graph: TSecretReachGraph = {
  getReferencers: (secret) =>
    ({ [dbPass.id]: [dbUrl], [dbUrl.id]: [connection], [connection.id]: [dbPass] })[secret.id] ?? [],
  getImporterFolderIds: (folderId) => ({ nested: ["consumer"], consumer: ["edge"] })[folderId] ?? []
};

const read = (overrides: Partial<TSecretLastRead>): TSecretLastRead => ({
  objectId: "shared",
  objectType: SecretReadObjectType.Folder,
  actorId: "identity-1",
  actorType: ActorType.IDENTITY,
  lastReadAt: new Date("2026-10-10T00:00:00.000Z"),
  ...overrides
});

const trackedSince = new Date("2026-10-01T00:00:00.000Z");

describe("getUtcMonthStart", () => {
  test("uses the UTC month, not the local one", () => {
    expect(getUtcMonthStart(new Date("2026-10-31T23:59:59.999Z"))).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    expect(getUtcMonthStart(new Date("2026-11-01T00:00:00.000Z"))).toEqual(new Date("2026-11-01T00:00:00.000Z"));
  });

  test("rolls over into the next and previous year", () => {
    expect(getUtcMonthStart(new Date("2026-12-15T00:00:00.000Z"), 1)).toEqual(new Date("2027-01-01T00:00:00.000Z"));
    expect(getUtcMonthStart(new Date("2026-01-15T00:00:00.000Z"), -1)).toEqual(new Date("2025-12-01T00:00:00.000Z"));
  });
});

describe("computeSecretReach", () => {
  const reach = computeSecretReach(dbPass, graph);

  test("follows references transitively and stops at cycles", () => {
    expect([...reach.secretIds].sort()).toEqual([connection.id, dbPass.id, dbUrl.id].sort());
  });

  test("includes the folders holding referencing secrets and every folder importing them, transitively", () => {
    expect([...reach.folderIds].sort()).toEqual(["consumer", "edge", "nested", "shared"]);
  });
});

describe("classifySecretReads", () => {
  const reach = computeSecretReach(dbPass, graph);
  const classify = (reads: TSecretLastRead[]) =>
    classifySecretReads(indexSecretReads(reads), reach, trackedSince).get(`${ActorType.IDENTITY}:identity-1`);

  test("counts a read of a folder that imports the secret through a chain", () => {
    expect(classify([read({ objectId: "edge" })])?.status).toBe(SecretReadStatus.Read);
  });

  test("counts a single read of a secret that references it", () => {
    expect(classify([read({ objectId: connection.id, objectType: SecretReadObjectType.Secret })])?.status).toBe(
      SecretReadStatus.Read
    );
  });

  test("ignores a single read of an unrelated secret, and a folder read recorded under a secret's id", () => {
    expect(classify([read({ objectId: "unrelated", objectType: SecretReadObjectType.Secret })])).toBeUndefined();
    expect(classify([read({ objectId: dbPass.id, objectType: SecretReadObjectType.Folder })])).toBeUndefined();
  });

  test("counts an unexpanded read only for the secret it returned, not the secrets it references", () => {
    expect(classify([read({ objectId: dbPass.id, objectType: SecretReadObjectType.SecretUnexpanded })])?.status).toBe(
      SecretReadStatus.Read
    );
    expect(
      classify([read({ objectId: connection.id, objectType: SecretReadObjectType.SecretUnexpanded })])
    ).toBeUndefined();
  });

  test("ignores reads from before the secret was tracked", () => {
    expect(classify([read({ lastReadAt: new Date("2026-09-30T00:00:00.000Z") })])).toBeUndefined();
  });

  test("keeps the latest read across all the ways the secret was reached", () => {
    const latestRead = new Date("2026-10-12T00:00:00.000Z");
    expect(
      classify([
        read({ lastReadAt: new Date("2026-10-05T00:00:00.000Z") }),
        read({ objectId: "consumer", lastReadAt: latestRead }),
        read({ objectId: dbUrl.id, objectType: SecretReadObjectType.Secret })
      ])
    ).toEqual({
      actorType: ActorType.IDENTITY,
      actorId: "identity-1",
      status: SecretReadStatus.Read,
      lastReadAt: latestRead
    });
  });
});

describe("coversWholeWindow", () => {
  const windowStart = new Date("2026-09-15T00:00:00.000Z");

  test("is true once the secret and the access have both existed for the whole window", () => {
    expect(coversWholeWindow(windowStart, new Date("2026-08-01T00:00:00.000Z"), windowStart)).toBe(true);
    expect(coversWholeWindow(windowStart, undefined, windowStart)).toBe(true);
  });

  test("is false for a secret newer than the window", () => {
    expect(coversWholeWindow(new Date("2026-10-01T00:00:00.000Z"), undefined, windowStart)).toBe(false);
  });

  test("is false for a reader whose access changed inside the window", () => {
    expect(coversWholeWindow(windowStart, new Date("2026-10-10T00:00:00.000Z"), windowStart)).toBe(false);
  });
});
