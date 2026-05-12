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

const getMigrationTimestamp = (migrationName: string) => migrationName.match(/^(\d+)/)?.[1] ?? "";

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

  if (unknownAppliedMigrationNames.length && pendingMigrationNames.length) {
    return {
      direction: "invalid",
      unknownAppliedMigrationNames,
      pendingMigrationNames
    };
  }

  const latestBundledMigrationTimestamp = bundledMigrationNames.map(getMigrationTimestamp).sort().at(-1) ?? "";
  const hasOnlyNewerUnknownMigrations = unknownAppliedMigrationNames.every(
    (migrationName) => getMigrationTimestamp(migrationName) > latestBundledMigrationTimestamp
  );

  if (unknownAppliedMigrationNames.length && hasOnlyNewerUnknownMigrations) {
    return {
      direction: "ahead",
      unknownAppliedMigrationNames,
      pendingMigrationNames: []
    };
  }

  if (unknownAppliedMigrationNames.length) {
    return {
      direction: "invalid",
      unknownAppliedMigrationNames,
      pendingMigrationNames
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
