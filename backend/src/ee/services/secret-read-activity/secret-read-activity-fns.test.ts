import { describe, expect, test } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";

import {
  calculateExposureScore,
  classifySecretReads,
  computeSecretReach,
  coversWholeWindow,
  getUtcMonthStart,
  indexSecretReads
} from "./secret-read-activity-fns";
import {
  SecretExposureBand,
  SecretExposureDriver,
  SecretReadObjectType,
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
    expect(classify([read({ objectId: "edge" })])).toBeDefined();
  });

  test("counts a single read of a secret that references it", () => {
    expect(classify([read({ objectId: connection.id, objectType: SecretReadObjectType.Secret })])).toBeDefined();
  });

  test("ignores a single read of an unrelated secret, and a folder read recorded under a secret's id", () => {
    expect(classify([read({ objectId: "unrelated", objectType: SecretReadObjectType.Secret })])).toBeUndefined();
    expect(classify([read({ objectId: dbPass.id, objectType: SecretReadObjectType.Folder })])).toBeUndefined();
  });

  test("counts an unexpanded read only for the secret it returned, not the secrets it references", () => {
    expect(classify([read({ objectId: dbPass.id, objectType: SecretReadObjectType.SecretUnexpanded })])).toBeDefined();
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

describe("calculateExposureScore", () => {
  const pointsOf = (score: ReturnType<typeof calculateExposureScore>) =>
    score.drivers.reduce((total, driver) => total + driver.points, 0);

  test("is zero with nothing to drive it", () => {
    const exposure = calculateExposureScore({ entitledCount: 0, unreadCount: 0, ghostReaderCount: 0 });
    expect(exposure).toEqual({ score: 0, band: SecretExposureBand.Low, drivers: [] });
  });

  test("saturates each term at its weight", () => {
    const exposure = calculateExposureScore({ entitledCount: 40, unreadCount: 40, ghostReaderCount: 4 });
    expect(exposure.score).toBe(100);
    expect(exposure.band).toBe(SecretExposureBand.Critical);
    expect(exposure.drivers.map(({ kind, points }) => [kind, points])).toEqual([
      [SecretExposureDriver.Readers, 45],
      [SecretExposureDriver.GhostReaders, 30],
      [SecretExposureDriver.UnusedAccess, 25]
    ]);
  });

  test("weighs a few readers far more than a few more", () => {
    const two = calculateExposureScore({ entitledCount: 2, unreadCount: 0, ghostReaderCount: 0 }).score;
    const twelve = calculateExposureScore({ entitledCount: 12, unreadCount: 0, ghostReaderCount: 0 }).score;
    const fortyTwo = calculateExposureScore({ entitledCount: 42, unreadCount: 0, ghostReaderCount: 0 }).score;
    expect(twelve - two).toBeGreaterThan(fortyTwo - twelve);
    expect(fortyTwo).toBe(45);
  });

  test("lists the drivers largest first, with whole points adding up to the score", () => {
    const exposure = calculateExposureScore({ entitledCount: 3, unreadCount: 1, ghostReaderCount: 1 });
    expect(exposure.score).toBe(Math.round(45 * (Math.log2(4) / Math.log2(41)) + 30 * 0.25 + 25 * (1 / 3)));
    expect(exposure.band).toBe(SecretExposureBand.Elevated);
    expect(pointsOf(exposure)).toBe(exposure.score);
    expect(exposure.drivers.map((driver) => driver.points)).toEqual(
      [...exposure.drivers.map((driver) => driver.points)].sort((a, b) => b - a)
    );
    expect(exposure.drivers.every((driver) => Number.isInteger(driver.points) && driver.points > 0)).toBe(true);
  });

  test("leaves out a term worth nothing", () => {
    const exposure = calculateExposureScore({ entitledCount: 5, unreadCount: 0, ghostReaderCount: 0 });
    expect(exposure.drivers.map((driver) => driver.kind)).toEqual([SecretExposureDriver.Readers]);
    expect(pointsOf(exposure)).toBe(exposure.score);
  });

  test("puts the score in its band", () => {
    const bandOf = (counts: Parameters<typeof calculateExposureScore>[0]) => calculateExposureScore(counts).band;
    expect(bandOf({ entitledCount: 1, unreadCount: 0, ghostReaderCount: 0 })).toBe(SecretExposureBand.Low);
    expect(bandOf({ entitledCount: 1, unreadCount: 1, ghostReaderCount: 0 })).toBe(SecretExposureBand.Elevated);
    expect(bandOf({ entitledCount: 10, unreadCount: 8, ghostReaderCount: 2 })).toBe(SecretExposureBand.High);
    expect(bandOf({ entitledCount: 30, unreadCount: 30, ghostReaderCount: 3 })).toBe(SecretExposureBand.Critical);
  });

  test("words each driver with its counts", () => {
    const { drivers } = calculateExposureScore({ entitledCount: 1, unreadCount: 1, ghostReaderCount: 1 });
    expect(drivers.map((driver) => driver.label)).toEqual([
      "1 of 1 has not read it in 30 days",
      "1 user or machine identity can read the value",
      "1 ghost reader can no longer read it but still knows the value"
    ]);
  });

  test("weights unused access by how much of the window the reads cover, and says so", () => {
    const counts = { entitledCount: 4, unreadCount: 4, ghostReaderCount: 0 };
    const fullWindow = calculateExposureScore(counts);
    const threeDays = calculateExposureScore(counts, 3);
    const firstDay = calculateExposureScore(counts, 0.9);
    const unusedPoints = (exposure: ReturnType<typeof calculateExposureScore>) =>
      exposure.drivers.find((driver) => driver.kind === SecretExposureDriver.UnusedAccess)?.points ?? 0;

    expect(unusedPoints(fullWindow)).toBe(25);
    expect(unusedPoints(threeDays)).toBeLessThan(unusedPoints(fullWindow));
    expect(unusedPoints(firstDay)).toBeLessThan(unusedPoints(threeDays));
    expect(threeDays.drivers.map((driver) => driver.label)).toContain("4 of 4 have not read it in the 3 days tracked");
    expect(calculateExposureScore(counts, 1).drivers.map((driver) => driver.label)).toContain(
      "4 of 4 have not read it in the 1 day tracked"
    );
    expect(firstDay.drivers.map((driver) => driver.label)).toContain(
      "4 of 4 have not read it since tracking began today"
    );
    expect(calculateExposureScore(counts, 45).drivers.map((driver) => driver.label)).toContain(
      "4 of 4 have not read it in 30 days"
    );
  });

  test("drops the unused-access driver when the tracked period is too short to give it a point", () => {
    const exposure = calculateExposureScore({ entitledCount: 1, unreadCount: 1, ghostReaderCount: 0 }, 0.4);
    expect(exposure.drivers.map((driver) => driver.kind)).toEqual([SecretExposureDriver.Readers]);
    expect(pointsOf(exposure)).toBe(exposure.score);
  });
});
