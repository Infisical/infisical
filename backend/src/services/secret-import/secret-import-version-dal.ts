import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TSecretImportVersions } from "@app/db/schemas/secret-import-versions";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TSecretImportVersionDALFactory = ReturnType<typeof secretImportVersionDALFactory>;

export const secretImportVersionDALFactory = (db: TDbClient) => {
  const secretImportVerOrm = ormify(db, TableName.SecretImportVersion);

  const findLatestImportVersions = async (importIds: string[], tx?: Knex) => {
    try {
      const docs: Array<TSecretImportVersions & { max: number }> = await (tx || db.replicaNode())(
        TableName.SecretImportVersion
      )
        .whereIn(`${TableName.SecretImportVersion}.importId`, importIds)
        .join(
          (tx || db)(TableName.SecretImportVersion)
            .groupBy("importId")
            .max("version")
            .select("importId")
            .as("latestVersion"),
          (bd) => {
            bd.on(`${TableName.SecretImportVersion}.importId`, "latestVersion.importId").andOn(
              `${TableName.SecretImportVersion}.version`,
              "latestVersion.max"
            );
          }
        );
      return docs.reduce<Record<string, TSecretImportVersions>>(
        (prev, curr) => ({ ...prev, [curr.importId || ""]: curr }),
        {}
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestImportVersions" });
    }
  };

  // Get latest versions by importIds
  const getLatestImportVersions = async (importIds: string[], tx?: Knex): Promise<Array<TSecretImportVersions>> => {
    if (!importIds.length) return [];

    const knexInstance = tx || db.replicaNode();
    return knexInstance(TableName.SecretImportVersion)
      .whereIn(`${TableName.SecretImportVersion}.importId`, importIds)
      .join(
        knexInstance(TableName.SecretImportVersion)
          .groupBy("importId")
          .max("version")
          .select("importId")
          .as("latestVersion"),
        (bd) => {
          bd.on(`${TableName.SecretImportVersion}.importId`, "latestVersion.importId").andOn(
            `${TableName.SecretImportVersion}.version`,
            "latestVersion.max"
          );
        }
      );
  };

  // Get specific versions and update with max version
  const getSpecificImportVersionsWithLatest = async (
    versionIds: string[],
    tx?: Knex
  ): Promise<Array<TSecretImportVersions>> => {
    if (!versionIds.length) return [];

    const knexInstance = tx || db.replicaNode();

    // Get specific versions
    const specificVersions = await knexInstance(TableName.SecretImportVersion).whereIn("id", versionIds);

    // Get importIds from these versions
    const specificImportIds = [...new Set(specificVersions.map((v) => v.importId).filter(Boolean))];

    if (!specificImportIds.length) return specificVersions;

    // Get max versions for these importIds
    const maxVersionsQuery = await knexInstance(TableName.SecretImportVersion)
      .whereIn("importId", specificImportIds)
      .groupBy("importId")
      .select("importId")
      .max("version", { as: "maxVersion" });

    // Create lookup map for max versions
    const maxVersionMap = maxVersionsQuery.reduce<Record<string, number>>((acc, item) => {
      if (item.maxVersion) {
        acc[item.importId] = item.maxVersion;
      }
      return acc;
    }, {});

    // Replace version with max version
    return specificVersions.map((version) => ({
      ...version,
      version: maxVersionMap[version.importId] || version.version
    }));
  };

  const findByIdsWithLatestVersion = async (importIds: string[], versionIds?: string[], tx?: Knex) => {
    try {
      if (!importIds.length && (!versionIds || !versionIds.length)) return {};

      // Run both queries in parallel
      const [latestVersions, specificVersionsWithLatest] = await Promise.all([
        importIds.length ? getLatestImportVersions(importIds, tx) : [],
        versionIds?.length ? getSpecificImportVersionsWithLatest(versionIds, tx) : []
      ]);

      const allDocs = [...latestVersions, ...specificVersionsWithLatest];

      // Convert array to record with importId as key
      return allDocs.reduce<Record<string, TSecretImportVersions>>(
        (prev, curr) => ({ ...prev, [curr.importId || ""]: curr }),
        {}
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByIdsWithLatestVersion" });
    }
  };

  return { ...secretImportVerOrm, findLatestImportVersions, findByIdsWithLatestVersion };
};
