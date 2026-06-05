import fs from "node:fs/promises";

import { type Knex } from "knex";

type TMigrationConfig = {
  directory: string;
  loadExtensions: string[];
  tableName: string;
};

type TMigrationBootDirection = {
  direction: "ahead" | "behind" | "current" | "invalid";
  unknownAppliedMigrationNames: string[];
  pendingMigrationNames: string[];
};

export const getMigrationBootDirection = ({
  appliedMigrationNames,
  bundledMigrationNames
}: {
  appliedMigrationNames: string[];
  bundledMigrationNames: string[];
}): TMigrationBootDirection => {
  const appliedMigrationNameSet = new Set(appliedMigrationNames);
  const bundledMigrationNameSet = new Set(bundledMigrationNames);

  const unknownAppliedMigrationNames = appliedMigrationNames.filter(
    (migrationName) => !bundledMigrationNameSet.has(migrationName)
  );

  const pendingMigrationNames = bundledMigrationNames.filter(
    (migrationName) => !appliedMigrationNameSet.has(migrationName)
  );

  // A true fork: the database has migrations this image lacks AND this image has migrations to apply on
  // top of that diverged history. Applying pending migrations onto a divergent DB is the only genuinely
  // unsafe case, so this is the one that must fail loud.
  if (unknownAppliedMigrationNames.length && pendingMigrationNames.length) {
    return {
      direction: "invalid",
      unknownAppliedMigrationNames,
      pendingMigrationNames
    };
  }

  // The database has migrations this image lacks, but this image has nothing pending to apply — its bundled
  // migrations are a strict subset of what's already applied. This is safe to skip and boot regardless of
  // timestamp ordering: backdated / late-merged migrations (common on long-lived branches) leave the history
  // interleaved-but-compatible, not forked.
  if (unknownAppliedMigrationNames.length) {
    return {
      direction: "ahead",
      unknownAppliedMigrationNames,
      pendingMigrationNames: []
    };
  }

  if (pendingMigrationNames.length) {
    return {
      direction: "behind",
      unknownAppliedMigrationNames: [],
      pendingMigrationNames
    };
  }

  return {
    direction: "current",
    unknownAppliedMigrationNames: [],
    pendingMigrationNames: []
  };
};

export const getBundledMigrationNames = async (migrationConfig: TMigrationConfig) => {
  const bundledMigrationNames = await fs.readdir(migrationConfig.directory);
  return bundledMigrationNames
    .filter((migrationName) => migrationConfig.loadExtensions.some((extension) => migrationName.endsWith(extension)))
    .sort();
};

export const getAppliedMigrationNames = async (db: Knex, tableName: string) => {
  const hasMigrationTable = await db.schema.hasTable(tableName);
  if (!hasMigrationTable) {
    return [];
  }

  const rows = (await db(tableName).select("name").orderBy("id")) as Array<{ name: string }>;
  return rows.map(({ name }) => name);
};

export const getMigrationBootState = async ({
  db,
  migrationConfig
}: {
  db: Knex;
  migrationConfig: TMigrationConfig;
}) => {
  const [appliedMigrationNames, bundledMigrationNames] = await Promise.all([
    getAppliedMigrationNames(db, migrationConfig.tableName),
    getBundledMigrationNames(migrationConfig)
  ]);

  return getMigrationBootDirection({ appliedMigrationNames, bundledMigrationNames });
};
