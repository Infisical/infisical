import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type Knex } from "knex";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAppliedMigrationNames,
  getMigrationBootDirection,
  getMigrationBootState
} from "./auto-start-migrations-fns";

const migrationTableName = "infisical_migrations";
const migrationConfig = {
  directory: "",
  loadExtensions: [".mjs", ".ts"],
  tableName: migrationTableName
};

const testMigrationNames = {
  first: "20260101000000_first.mjs",
  second: "20260102000000_second.mjs",
  renamedSecond: "20260102000000_renamed-second.mjs",
  future: "20260103000000_future.mjs"
};

let tempDirs: string[] = [];

const writeBundledMigrations = async (migrationNames: string[]) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "infisical-migrations-"));
  tempDirs.push(tempDir);

  await Promise.all(migrationNames.map((migrationName) => fs.writeFile(path.join(tempDir, migrationName), "")));

  return {
    ...migrationConfig,
    directory: tempDir
  };
};

const buildDbWithMissingMigrationTable = () =>
  ({
    schema: {
      hasTable: vi.fn().mockResolvedValue(false)
    }
  }) as unknown as Knex;

const buildDbWithAppliedMigrations = (migrationNames: string[]) => {
  const orderBy = vi.fn().mockResolvedValue(migrationNames.map((name) => ({ name })));
  const select = vi.fn().mockReturnValue({ orderBy });
  const db = vi.fn().mockReturnValue({ select });

  return Object.assign(db, {
    schema: {
      hasTable: vi.fn().mockResolvedValue(true)
    }
  }) as unknown as Knex;
};

afterEach(async () => {
  await Promise.all(tempDirs.map((tempDir) => fs.rm(tempDir, { force: true, recursive: true })));
  tempDirs = [];
  vi.restoreAllMocks();
});

describe("getMigrationBootDirection", () => {
  it("returns current when applied migrations match bundled migrations", () => {
    expect(
      getMigrationBootDirection({
        appliedMigrationNames: [testMigrationNames.first, testMigrationNames.second],
        bundledMigrationNames: [testMigrationNames.first, testMigrationNames.second]
      })
    ).toEqual({
      direction: "current",
      unknownAppliedMigrationNames: [],
      pendingMigrationNames: []
    });
  });

  it("returns behind when bundled migrations have not been applied yet", () => {
    expect(
      getMigrationBootDirection({
        appliedMigrationNames: [testMigrationNames.first],
        bundledMigrationNames: [testMigrationNames.first, testMigrationNames.second]
      })
    ).toEqual({
      direction: "behind",
      unknownAppliedMigrationNames: [],
      pendingMigrationNames: [testMigrationNames.second]
    });
  });

  it("returns ahead when the database has migrations not bundled in this image", () => {
    expect(
      getMigrationBootDirection({
        appliedMigrationNames: [testMigrationNames.first, testMigrationNames.second, testMigrationNames.future],
        bundledMigrationNames: [testMigrationNames.first, testMigrationNames.second]
      })
    ).toEqual({
      direction: "ahead",
      unknownAppliedMigrationNames: [testMigrationNames.future],
      pendingMigrationNames: []
    });
  });

  it("treats first deployment as behind when no migrations have been applied", () => {
    expect(
      getMigrationBootDirection({
        appliedMigrationNames: [],
        bundledMigrationNames: [testMigrationNames.first, testMigrationNames.second]
      })
    ).toEqual({
      direction: "behind",
      unknownAppliedMigrationNames: [],
      pendingMigrationNames: [testMigrationNames.first, testMigrationNames.second]
    });
  });

  it("treats a restored forward image as current after the rollback migration is reapplied", () => {
    expect(
      getMigrationBootDirection({
        appliedMigrationNames: [testMigrationNames.first, testMigrationNames.second, testMigrationNames.future],
        bundledMigrationNames: [testMigrationNames.first, testMigrationNames.second, testMigrationNames.future]
      })
    ).toEqual({
      direction: "current",
      unknownAppliedMigrationNames: [],
      pendingMigrationNames: []
    });
  });

  it("treats a manually applied migration from another image as ahead", () => {
    expect(
      getMigrationBootDirection({
        appliedMigrationNames: [testMigrationNames.first, testMigrationNames.second, testMigrationNames.future],
        bundledMigrationNames: [testMigrationNames.first, testMigrationNames.second]
      }).direction
    ).toBe("ahead");
  });

  it("treats a manually removed migration record as behind", () => {
    expect(
      getMigrationBootDirection({
        appliedMigrationNames: [testMigrationNames.first],
        bundledMigrationNames: [testMigrationNames.first, testMigrationNames.second]
      }).direction
    ).toBe("behind");
  });

  it("treats an unknown historical migration as invalid instead of rollback-safe ahead", () => {
    expect(
      getMigrationBootDirection({
        appliedMigrationNames: [testMigrationNames.first, testMigrationNames.renamedSecond],
        bundledMigrationNames: [testMigrationNames.first, testMigrationNames.second, testMigrationNames.future]
      })
    ).toMatchObject({
      direction: "invalid",
      unknownAppliedMigrationNames: [testMigrationNames.renamedSecond],
      pendingMigrationNames: [testMigrationNames.second, testMigrationNames.future]
    });
  });

  it("treats mixed unknown future migrations and missing bundled migrations as invalid", () => {
    expect(
      getMigrationBootDirection({
        appliedMigrationNames: [testMigrationNames.first, testMigrationNames.future],
        bundledMigrationNames: [testMigrationNames.first, testMigrationNames.second]
      })
    ).toMatchObject({
      direction: "invalid",
      unknownAppliedMigrationNames: [testMigrationNames.future],
      pendingMigrationNames: [testMigrationNames.second]
    });
  });
});

describe("getMigrationBootState", () => {
  it("returns behind on first deployment when the migration table does not exist", async () => {
    const testMigrationConfig = await writeBundledMigrations([testMigrationNames.first, testMigrationNames.second]);

    await expect(
      getMigrationBootState({
        db: buildDbWithMissingMigrationTable(),
        migrationConfig: testMigrationConfig
      })
    ).resolves.toEqual({
      direction: "behind",
      unknownAppliedMigrationNames: [],
      pendingMigrationNames: [testMigrationNames.first, testMigrationNames.second]
    });
  });

  it("returns ahead when a newer migration was deployed and the app code was rolled back", async () => {
    const testMigrationConfig = await writeBundledMigrations([testMigrationNames.first, testMigrationNames.second]);

    await expect(
      getMigrationBootState({
        db: buildDbWithAppliedMigrations([
          testMigrationNames.first,
          testMigrationNames.second,
          testMigrationNames.future
        ]),
        migrationConfig: testMigrationConfig
      })
    ).resolves.toMatchObject({
      direction: "ahead",
      unknownAppliedMigrationNames: [testMigrationNames.future]
    });
  });

  it("propagates database errors when the database is unavailable", async () => {
    const testMigrationConfig = await writeBundledMigrations([testMigrationNames.first]);
    const db = {
      schema: {
        hasTable: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"))
      }
    } as unknown as Knex;

    await expect(
      getMigrationBootState({
        db,
        migrationConfig: testMigrationConfig
      })
    ).rejects.toThrow("connect ECONNREFUSED");
  });
});

describe("getAppliedMigrationNames", () => {
  it("returns an empty list when the migration table does not exist", async () => {
    await expect(getAppliedMigrationNames(buildDbWithMissingMigrationTable(), migrationTableName)).resolves.toEqual([]);
  });
});
