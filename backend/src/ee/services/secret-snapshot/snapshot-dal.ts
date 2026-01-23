/* eslint-disable no-await-in-loop,@typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-argument */
import { Knex } from "knex";
import { z } from "zod";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TSecretFolderVersions } from "@app/db/schemas/secret-folder-versions";
import { TSecretSnapshotFolders } from "@app/db/schemas/secret-snapshot-folders";
import { TSecretSnapshots } from "@app/db/schemas/secret-snapshots";
import { SecretVersionsSchema, TSecretVersions } from "@app/db/schemas/secret-versions";
import { SecretVersionsV2Schema, TSecretVersionsV2 } from "@app/db/schemas/secret-versions-v2";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";

export type TSnapshotDALFactory = ReturnType<typeof snapshotDALFactory>;

export const snapshotDALFactory = (db: TDbClient) => {
  const secretSnapshotOrm = ormify(db, TableName.Snapshot);

  const findById = async (id: string, tx?: Knex) => {
    try {
      const data = await (tx || db.replicaNode())(TableName.Snapshot)
        .where(`${TableName.Snapshot}.id`, id)
        .join(TableName.Environment, `${TableName.Snapshot}.envId`, `${TableName.Environment}.id`)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .select(selectAllTableCols(TableName.Snapshot))
        .select(
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("version").withSchema(TableName.Project).as("projectVersion")
        )
        .first();
      if (data) {
        const { envId, envName, envSlug } = data;
        return { ...data, envId, enviroment: { id: envId, name: envName, slug: envSlug } };
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "FindById" });
    }
  };

  const countOfSnapshotsByFolderId = async (folderId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.Snapshot)
        .where({ folderId })
        .groupBy(["folderId"])
        .count("folderId")
        .first();
      return parseInt((doc?.count as string) || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountOfProjectSnapshot" });
    }
  };

  const findSecretSnapshotDataById = async (snapshotId: string, tx?: Knex) => {
    try {
      const data = await (tx || db.replicaNode())(TableName.Snapshot)
        .where(`${TableName.Snapshot}.id`, snapshotId)
        .join(TableName.Environment, `${TableName.Snapshot}.envId`, `${TableName.Environment}.id`)
        .leftJoin(TableName.SnapshotSecret, `${TableName.Snapshot}.id`, `${TableName.SnapshotSecret}.snapshotId`)
        .leftJoin(
          TableName.SecretVersion,
          `${TableName.SnapshotSecret}.secretVersionId`,
          `${TableName.SecretVersion}.id`
        )
        .leftJoin(
          TableName.SecretVersionTag,
          `${TableName.SecretVersionTag}.${TableName.SecretVersion}Id`,
          `${TableName.SecretVersion}.id`
        )
        .leftJoin(
          TableName.SecretTag,
          `${TableName.SecretVersionTag}.${TableName.SecretTag}Id`,
          `${TableName.SecretTag}.id`
        )
        .leftJoin(TableName.SnapshotFolder, `${TableName.SnapshotFolder}.snapshotId`, `${TableName.Snapshot}.id`)
        .leftJoin<TSecretFolderVersions>(
          TableName.SecretFolderVersion,
          `${TableName.SnapshotFolder}.folderVersionId`,
          `${TableName.SecretFolderVersion}.id`
        )
        .select(selectAllTableCols(TableName.SecretVersion))
        .select(
          db.ref("id").withSchema(TableName.Snapshot).as("snapshotId"),
          db.ref("createdAt").withSchema(TableName.Snapshot).as("snapshotCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.Snapshot).as("snapshotUpdatedAt"),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("name").withSchema(TableName.SecretFolderVersion).as("folderVerName"),
          db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("folderVerId"),
          db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
          db.ref("id").withSchema(TableName.SecretVersionTag).as("tagVersionId"),
          db.ref("color").withSchema(TableName.SecretTag).as("tagColor"),
          db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug")
        );
      return sqlNestRelationships({
        data,
        key: "snapshotId",
        parentMapper: ({
          snapshotId: id,
          folderId,
          projectId,
          envId,
          envSlug,
          envName,
          snapshotCreatedAt: createdAt,
          snapshotUpdatedAt: updatedAt
        }) => ({
          id,
          folderId,
          projectId,
          createdAt,
          updatedAt,
          environment: { id: envId, slug: envSlug, name: envName }
        }),
        childrenMapper: [
          {
            key: "id",
            label: "secretVersions" as const,
            mapper: (el) => SecretVersionsSchema.parse(el),
            childrenMapper: [
              {
                key: "tagVersionId",
                label: "tags" as const,
                mapper: ({ tagId: id, tagSlug: slug, tagColor: color, tagVersionId: vId }) => ({
                  id,
                  name: slug,
                  slug,
                  color,
                  vId
                })
              }
            ]
          },
          {
            key: "folderVerId",
            label: "folderVersion" as const,
            mapper: ({ folderVerId: id, folderVerName: name }) => ({ id, name })
          }
        ]
      })?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretSnapshotDataById" });
    }
  };

  const findSecretSnapshotV2DataById = async (snapshotId: string, tx?: Knex) => {
    try {
      const data = await (tx || db.replicaNode())(TableName.Snapshot)
        .where(`${TableName.Snapshot}.id`, snapshotId)
        .join(TableName.Environment, `${TableName.Snapshot}.envId`, `${TableName.Environment}.id`)
        .leftJoin(TableName.SnapshotSecretV2, `${TableName.Snapshot}.id`, `${TableName.SnapshotSecretV2}.snapshotId`)
        .leftJoin(
          TableName.SecretVersionV2,
          `${TableName.SnapshotSecretV2}.secretVersionId`,
          `${TableName.SecretVersionV2}.id`
        )
        .leftJoin(
          TableName.SecretVersionV2Tag,
          `${TableName.SecretVersionV2Tag}.${TableName.SecretVersionV2}Id`,
          `${TableName.SecretVersionV2}.id`
        )
        .leftJoin(
          TableName.SecretTag,
          `${TableName.SecretVersionV2Tag}.${TableName.SecretTag}Id`,
          `${TableName.SecretTag}.id`
        )
        .leftJoin(TableName.SnapshotFolder, `${TableName.SnapshotFolder}.snapshotId`, `${TableName.Snapshot}.id`)
        .leftJoin<TSecretFolderVersions>(
          TableName.SecretFolderVersion,
          `${TableName.SnapshotFolder}.folderVersionId`,
          `${TableName.SecretFolderVersion}.id`
        )
        .leftJoin(
          TableName.SecretRotationV2SecretMapping,
          `${TableName.SecretRotationV2SecretMapping}.secretId`,
          `${TableName.SecretVersionV2}.secretId`
        )
        .select(selectAllTableCols(TableName.SecretVersionV2))
        .select(
          db.ref("id").withSchema(TableName.Snapshot).as("snapshotId"),
          db.ref("createdAt").withSchema(TableName.Snapshot).as("snapshotCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.Snapshot).as("snapshotUpdatedAt"),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("name").withSchema(TableName.SecretFolderVersion).as("folderVerName"),
          db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("folderVerId"),
          db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
          db.ref("id").withSchema(TableName.SecretVersionV2Tag).as("tagVersionId"),
          db.ref("color").withSchema(TableName.SecretTag).as("tagColor"),
          db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"),
          db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping)
        );
      return sqlNestRelationships({
        data,
        key: "snapshotId",
        parentMapper: ({
          snapshotId: id,
          folderId,
          projectId,
          envId,
          envSlug,
          envName,
          snapshotCreatedAt: createdAt,
          snapshotUpdatedAt: updatedAt
        }) => ({
          id,
          folderId,
          projectId,
          createdAt,
          updatedAt,
          environment: { id: envId, slug: envSlug, name: envName }
        }),
        childrenMapper: [
          {
            key: "id",
            label: "secretVersions" as const,
            mapper: (el) => ({
              ...SecretVersionsV2Schema.parse(el),
              isRotatedSecret: Boolean(el.rotationId),
              rotationId: el.rotationId
            }),
            childrenMapper: [
              {
                key: "tagVersionId",
                label: "tags" as const,
                mapper: ({ tagId: id, tagSlug: slug, tagColor: color, tagVersionId: vId }) => ({
                  id,
                  name: slug,
                  slug,
                  color,
                  vId
                })
              }
            ]
          },
          {
            key: "folderVerId",
            label: "folderVersion" as const,
            mapper: ({ folderVerId: id, folderVerName: name }) => ({ id, name })
          }
        ]
      })?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretSnapshotDataById" });
    }
  };

  // this is used for rollback
  // from a starting snapshot it will collect all the secrets and folder of that
  // then it will start go through recursively the below folders latest snapshots then their child folder snapshot until leaf node
  // the recursive part find all snapshot id
  // then joins with respective secrets and folder
  const findRecursivelySnapshots = async (snapshotId: string, tx?: Knex) => {
    try {
      const data = await (tx || db.replicaNode())
        .withRecursive("parent", (qb) => {
          void qb
            .from(TableName.Snapshot)
            .leftJoin<TSecretSnapshotFolders>(
              TableName.SnapshotFolder,
              `${TableName.SnapshotFolder}.snapshotId`,
              `${TableName.Snapshot}.id`
            )
            .leftJoin<TSecretFolderVersions>(
              TableName.SecretFolderVersion,
              `${TableName.SnapshotFolder}.folderVersionId`,
              `${TableName.SecretFolderVersion}.id`
            )
            .select(selectAllTableCols(TableName.Snapshot))
            .select({ depth: 1 })
            .select(
              db.ref("name").withSchema(TableName.SecretFolderVersion).as("folderVerName"),
              db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("folderVerId")
            )
            .where(`${TableName.Snapshot}.id`, snapshotId)
            .union(
              (cb) =>
                void cb
                  .select(selectAllTableCols(TableName.Snapshot))
                  .select({ depth: db.raw("parent.depth + 1") })
                  .select(
                    db.ref("name").withSchema(TableName.SecretFolderVersion).as("folderVerName"),
                    db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("folderVerId")
                  )
                  .from(TableName.Snapshot)
                  .join<TSecretSnapshots, TSecretSnapshots & { secretId: string; max: number }>(
                    db(TableName.Snapshot).groupBy("folderId").max("createdAt").select("folderId").as("latestVersion"),
                    `${TableName.Snapshot}.createdAt`,
                    "latestVersion.max"
                  )
                  .leftJoin<TSecretSnapshotFolders>(
                    TableName.SnapshotFolder,
                    `${TableName.SnapshotFolder}.snapshotId`,
                    `${TableName.Snapshot}.id`
                  )
                  .leftJoin<TSecretFolderVersions>(
                    TableName.SecretFolderVersion,
                    `${TableName.SnapshotFolder}.folderVersionId`,
                    `${TableName.SecretFolderVersion}.id`
                  )
                  .join("parent", "parent.folderVerId", `${TableName.Snapshot}.folderId`)
            );
        })
        .orderBy("depth", "asc")
        .from<TSecretSnapshots & { folderVerId: string; folderVerName: string }>("parent")
        .leftJoin<TSecretSnapshots>(TableName.SnapshotSecret, `parent.id`, `${TableName.SnapshotSecret}.snapshotId`)
        .leftJoin<TSecretVersions>(
          TableName.SecretVersion,
          `${TableName.SnapshotSecret}.secretVersionId`,
          `${TableName.SecretVersion}.id`
        )
        .leftJoin(
          TableName.SecretVersionTag,
          `${TableName.SecretVersionTag}.${TableName.SecretVersion}Id`,
          `${TableName.SecretVersion}.id`
        )
        .leftJoin(
          TableName.SecretTag,
          `${TableName.SecretVersionTag}.${TableName.SecretTag}Id`,
          `${TableName.SecretTag}.id`
        )
        .leftJoin<{ latestSecretVersion: number }>(
          (tx || db)(TableName.SecretVersion)
            .groupBy("secretId")
            .select("secretId")
            .max("version")
            .as("secGroupByMaxVersion"),
          `${TableName.SecretVersion}.secretId`,
          "secGroupByMaxVersion.secretId"
        )
        .leftJoin<{ latestFolderVersion: number }>(
          (tx || db)(TableName.SecretFolderVersion)
            .groupBy("folderId")
            .select("folderId")
            .max("version")
            .as("folderGroupByMaxVersion"),
          `parent.folderId`,
          "folderGroupByMaxVersion.folderId"
        )
        .select(selectAllTableCols(TableName.SecretVersion))
        .select(
          db.ref("id").withSchema("parent").as("snapshotId"),
          db.ref("folderId").withSchema("parent").as("snapshotFolderId"),
          db.ref("parentFolderId").withSchema("parent").as("snapshotParentFolderId"),
          db.ref("folderVerName").withSchema("parent"),
          db.ref("folderVerId").withSchema("parent"),
          db.ref("max").withSchema("secGroupByMaxVersion").as("latestSecretVersion"),
          db.ref("max").withSchema("folderGroupByMaxVersion").as("latestFolderVersion"),
          db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
          db.ref("id").withSchema(TableName.SecretVersionTag).as("tagVersionId"),
          db.ref("color").withSchema(TableName.SecretTag).as("tagColor"),
          db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug")
        );

      const formated = sqlNestRelationships({
        data,
        key: "snapshotId",
        parentMapper: ({ snapshotId: id, snapshotFolderId: folderId, snapshotParentFolderId: parentFolderId }) => ({
          id,
          folderId,
          parentFolderId
        }),
        childrenMapper: [
          {
            key: "id",
            label: "secretVersions" as const,
            mapper: (el) => ({
              ...SecretVersionsSchema.parse(el),
              latestSecretVersion: el.latestSecretVersion as number
            }),
            childrenMapper: [
              {
                key: "tagVersionId",
                label: "tags" as const,
                mapper: ({ tagId: id, tagSlug: slug, tagColor: color, tagVersionId: vId }) => ({
                  id,
                  name: slug,
                  slug,
                  color,
                  vId
                })
              }
            ]
          },
          {
            key: "folderVerId",
            label: "folderVersion" as const,
            mapper: ({ folderVerId: id, folderVerName: name, latestFolderVersion }) => ({
              id,
              name,
              latestFolderVersion: latestFolderVersion as number
            })
          }
        ]
      });
      return formated;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRecursivelySnapshots" });
    }
  };

  // this is used for rollback
  // from a starting snapshot it will collect all the secrets and folder of that
  // then it will start go through recursively the below folders latest snapshots then their child folder snapshot until leaf node
  // the recursive part find all snapshot id
  // then joins with respective secrets and folder
  const findRecursivelySnapshotsV2Bridge = async (snapshotId: string, tx?: Knex) => {
    try {
      const data = await (tx || db.replicaNode())
        .withRecursive("parent", (qb) => {
          void qb
            .from(TableName.Snapshot)
            .leftJoin<TSecretSnapshotFolders>(
              TableName.SnapshotFolder,
              `${TableName.SnapshotFolder}.snapshotId`,
              `${TableName.Snapshot}.id`
            )
            .leftJoin<TSecretFolderVersions>(
              TableName.SecretFolderVersion,
              `${TableName.SnapshotFolder}.folderVersionId`,
              `${TableName.SecretFolderVersion}.id`
            )
            .select(selectAllTableCols(TableName.Snapshot))
            .select({ depth: 1 })
            .select(
              db.ref("name").withSchema(TableName.SecretFolderVersion).as("folderVerName"),
              db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("folderVerId")
            )
            .where(`${TableName.Snapshot}.id`, snapshotId)
            .union(
              (cb) =>
                void cb
                  .select(selectAllTableCols(TableName.Snapshot))
                  .select({ depth: db.raw("parent.depth + 1") })
                  .select(
                    db.ref("name").withSchema(TableName.SecretFolderVersion).as("folderVerName"),
                    db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("folderVerId")
                  )
                  .from(TableName.Snapshot)
                  .join<TSecretSnapshots, TSecretSnapshots & { secretId: string; max: number }>(
                    db(TableName.Snapshot).groupBy("folderId").max("createdAt").select("folderId").as("latestVersion"),
                    `${TableName.Snapshot}.createdAt`,
                    "latestVersion.max"
                  )
                  .leftJoin<TSecretSnapshotFolders>(
                    TableName.SnapshotFolder,
                    `${TableName.SnapshotFolder}.snapshotId`,
                    `${TableName.Snapshot}.id`
                  )
                  .leftJoin<TSecretFolderVersions>(
                    TableName.SecretFolderVersion,
                    `${TableName.SnapshotFolder}.folderVersionId`,
                    `${TableName.SecretFolderVersion}.id`
                  )
                  .join("parent", "parent.folderVerId", `${TableName.Snapshot}.folderId`)
            );
        })
        .orderBy("depth", "asc")
        .from<TSecretSnapshots & { folderVerId: string; folderVerName: string }>("parent")
        .leftJoin<TSecretSnapshots>(TableName.SnapshotSecretV2, `parent.id`, `${TableName.SnapshotSecretV2}.snapshotId`)
        .leftJoin<TSecretVersionsV2>(
          TableName.SecretVersionV2,
          `${TableName.SnapshotSecretV2}.secretVersionId`,
          `${TableName.SecretVersionV2}.id`
        )
        .leftJoin(
          TableName.SecretVersionV2Tag,
          `${TableName.SecretVersionV2Tag}.${TableName.SecretVersionV2}Id`,
          `${TableName.SecretVersionV2}.id`
        )
        .leftJoin(
          TableName.SecretTag,
          `${TableName.SecretVersionV2Tag}.${TableName.SecretTag}Id`,
          `${TableName.SecretTag}.id`
        )
        .leftJoin(
          TableName.SecretRotationV2SecretMapping,
          `${TableName.SecretVersionV2}.secretId`,
          `${TableName.SecretRotationV2SecretMapping}.secretId`
        )
        .leftJoin<{ latestSecretVersion: number }>(
          (tx || db)(TableName.SecretVersionV2)
            .groupBy("secretId")
            .select("secretId")
            .max("version")
            .as("secGroupByMaxVersion"),
          `${TableName.SecretVersionV2}.secretId`,
          "secGroupByMaxVersion.secretId"
        )
        .leftJoin<{ latestFolderVersion: number }>(
          (tx || db)(TableName.SecretFolderVersion)
            .groupBy("folderId")
            .select("folderId")
            .max("version")
            .as("folderGroupByMaxVersion"),
          `parent.folderId`,
          "folderGroupByMaxVersion.folderId"
        )
        .select(selectAllTableCols(TableName.SecretVersionV2))
        .select(
          db.ref("id").withSchema("parent").as("snapshotId"),
          db.ref("folderId").withSchema("parent").as("snapshotFolderId"),
          db.ref("parentFolderId").withSchema("parent").as("snapshotParentFolderId"),
          db.ref("folderVerName").withSchema("parent"),
          db.ref("folderVerId").withSchema("parent"),
          db.ref("max").withSchema("secGroupByMaxVersion").as("latestSecretVersion"),
          db.ref("max").withSchema("folderGroupByMaxVersion").as("latestFolderVersion"),
          db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
          db.ref("id").withSchema(TableName.SecretVersionV2Tag).as("tagVersionId"),
          db.ref("color").withSchema(TableName.SecretTag).as("tagColor"),
          db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"),
          db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping)
        );

      const formated = sqlNestRelationships({
        data,
        key: "snapshotId",
        parentMapper: ({ snapshotId: id, snapshotFolderId: folderId, snapshotParentFolderId: parentFolderId }) => ({
          id,
          folderId,
          parentFolderId
        }),
        childrenMapper: [
          {
            key: "id",
            label: "secretVersions" as const,
            mapper: (el) => ({
              ...SecretVersionsV2Schema.parse(el),
              latestSecretVersion: el.latestSecretVersion as number,
              isRotatedSecret: Boolean(el.rotationId)
            }),
            childrenMapper: [
              {
                key: "tagVersionId",
                label: "tags" as const,
                mapper: ({ tagId: id, tagSlug: slug, tagColor: color, tagVersionId: vId }) => ({
                  id,
                  name: slug,
                  slug,
                  color,
                  vId
                })
              }
            ]
          },
          {
            key: "folderVerId",
            label: "folderVersion" as const,
            mapper: ({ folderVerId: id, folderVerName: name, latestFolderVersion }) => ({
              id,
              name,
              latestFolderVersion: latestFolderVersion as number
            })
          }
        ]
      });
      return formated;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRecursivelySnapshots" });
    }
  };

  // instead of copying all child folders
  // we will take the latest snapshot of those folders
  // when we need to rollback we will pull from these snapshots
  const findLatestSnapshotByFolderId = async (folderId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Snapshot)
        .where(`${TableName.Snapshot}.folderId`, folderId)
        .join<TSecretSnapshots>(
          (tx || db.replicaNode())(TableName.Snapshot)
            .groupBy("folderId")
            .max("createdAt")
            .select("folderId")
            .as("latestVersion"),
          (bd) => {
            bd.on(`${TableName.Snapshot}.folderId`, "latestVersion.folderId").andOn(
              `${TableName.Snapshot}.createdAt`,
              "latestVersion.max"
            );
          }
        )
        .first();
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestVersionByFolderId" });
    }
  };

  /**
   * Prunes excess snapshots from the database to ensure only a specified number of recent snapshots are retained for each folder.
   *
   * This function operates in three main steps:
   * 1. Pruning snapshots from current folders.
   * 2. Pruning snapshots from non-current folders (versioned ones).
   * 3. Removing orphaned snapshots that do not belong to any existing folder or folder version.
   *
   * The function processes snapshots in batches, determined by the `PRUNE_FOLDER_BATCH_SIZE` constant,
   * to manage the large datasets without overwhelming the DB.
   *
   * Steps:
   * - Fetch a batch of folder IDs.
   * - For each batch, use a Common Table Expression (CTE) to rank snapshots within each folder by their creation date.
   * - Identify and delete snapshots that exceed the project's point-in-time version limit (`pitVersionLimit`).
   * - Repeat the process for versioned folders.
   * - Finally, delete orphaned snapshots that do not have an associated folder.
   */
  const pruneExcessSnapshots = async () => {
    const PRUNE_FOLDER_BATCH_SIZE = 10000;

    logger.info(`${QueueName.DailyResourceCleanUp}: pruning secret snapshots started`);
    try {
      let uuidOffset = "00000000-0000-0000-0000-000000000000";
      // cleanup snapshots from current folders
      // eslint-disable-next-line no-constant-condition, no-unreachable-loop
      while (true) {
        const folderBatch = await db(TableName.SecretFolder)
          .where("id", ">", uuidOffset)
          .where("isReserved", false)
          .orderBy("id", "asc")
          .limit(PRUNE_FOLDER_BATCH_SIZE)
          .select("id");

        const batchEntries = folderBatch.map((folder) => folder.id);

        if (folderBatch.length) {
          try {
            logger.info(`Pruning snapshots in [range=${batchEntries[0]}:${batchEntries[batchEntries.length - 1]}]`);
            await db(TableName.Snapshot)
              .with("snapshot_cte", (qb) => {
                void qb
                  .from(TableName.Snapshot)
                  .whereIn(`${TableName.Snapshot}.folderId`, batchEntries)
                  .select(
                    "folderId",
                    `${TableName.Snapshot}.id as id`,
                    db.raw(
                      `ROW_NUMBER() OVER (PARTITION BY ${TableName.Snapshot}."folderId" ORDER BY ${TableName.Snapshot}."createdAt" DESC) AS row_num`
                    )
                  );
              })
              .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.Snapshot}.folderId`)
              .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
              .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Environment}.projectId`)
              .join("snapshot_cte", "snapshot_cte.id", `${TableName.Snapshot}.id`)
              .whereRaw(`snapshot_cte.row_num > ${TableName.Project}."pitVersionLimit"`)
              .delete();
          } catch (err) {
            logger.error(
              `Failed to prune snapshots from current folders in range ${batchEntries[0]}:${
                batchEntries[batchEntries.length - 1]
              }`
            );
          } finally {
            uuidOffset = batchEntries[batchEntries.length - 1];
          }
        } else {
          break;
        }
      }

      // cleanup snapshots from non-current folders
      uuidOffset = "00000000-0000-0000-0000-000000000000";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const folderBatch = await db(TableName.SecretFolderVersion)
          .select("folderId")
          .distinct("folderId")
          .where("folderId", ">", uuidOffset)
          .orderBy("folderId", "asc")
          .limit(PRUNE_FOLDER_BATCH_SIZE);

        const batchEntries = folderBatch.map((folder) => folder.folderId);

        if (folderBatch.length) {
          try {
            logger.info(`Pruning snapshots in range ${batchEntries[0]}:${batchEntries[batchEntries.length - 1]}`);
            await db(TableName.Snapshot)
              .with("snapshot_cte", (qb) => {
                void qb
                  .from(TableName.Snapshot)
                  .whereIn(`${TableName.Snapshot}.folderId`, batchEntries)
                  .select(
                    "folderId",
                    `${TableName.Snapshot}.id as id`,
                    db.raw(
                      `ROW_NUMBER() OVER (PARTITION BY ${TableName.Snapshot}."folderId" ORDER BY ${TableName.Snapshot}."createdAt" DESC) AS row_num`
                    )
                  );
              })
              .join(
                TableName.SecretFolderVersion,
                `${TableName.SecretFolderVersion}.folderId`,
                `${TableName.Snapshot}.folderId`
              )
              .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolderVersion}.envId`)
              .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Environment}.projectId`)
              .join("snapshot_cte", "snapshot_cte.id", `${TableName.Snapshot}.id`)
              .whereRaw(`snapshot_cte.row_num > ${TableName.Project}."pitVersionLimit"`)
              .delete();
          } catch (err) {
            logger.error(
              `Failed to prune snapshots from non-current folders in range ${batchEntries[0]}:${
                batchEntries[batchEntries.length - 1]
              }`
            );
          } finally {
            uuidOffset = batchEntries[batchEntries.length - 1];
          }
        } else {
          break;
        }
      }

      // cleanup orphaned snapshots (those that don't belong to an existing folder and folder version)
      await db(TableName.Snapshot)
        .whereNotIn("folderId", (qb) => {
          void qb
            .select("folderId")
            .from(TableName.SecretFolderVersion)
            .union((qb1) => void qb1.select("id").from(TableName.SecretFolder));
        })
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "SnapshotPrune" });
    }
    logger.info(`${QueueName.DailyResourceCleanUp}: pruning secret snapshots completed`);
  };

  // special query for migration for secret v2
  const findNSecretV1SnapshotByFolderId = async (folderId: string, n = 15, tx?: Knex) => {
    try {
      const query = (tx || db.replicaNode())(TableName.Snapshot)
        .leftJoin(TableName.SnapshotSecret, `${TableName.Snapshot}.id`, `${TableName.SnapshotSecret}.snapshotId`)
        .leftJoin(
          TableName.SecretVersion,
          `${TableName.SnapshotSecret}.secretVersionId`,
          `${TableName.SecretVersion}.id`
        )
        .leftJoin(
          TableName.SecretVersionTag,
          `${TableName.SecretVersionTag}.${TableName.SecretVersion}Id`,
          `${TableName.SecretVersion}.id`
        )
        .select(selectAllTableCols(TableName.SecretVersion))
        .select(
          db.ref("id").withSchema(TableName.Snapshot).as("snapshotId"),
          db.ref("createdAt").withSchema(TableName.Snapshot).as("snapshotCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.Snapshot).as("snapshotUpdatedAt"),
          db.ref("envId").withSchema(TableName.SnapshotSecret).as("snapshotEnvId"),
          db.ref("id").withSchema(TableName.SecretVersionTag).as("secretVersionTagId"),
          db.ref("secret_versionsId").withSchema(TableName.SecretVersionTag).as("secretVersionTagSecretId"),
          db.ref("secret_tagsId").withSchema(TableName.SecretVersionTag).as("secretVersionTagSecretTagId"),
          db.raw(
            `DENSE_RANK() OVER (partition by ${TableName.Snapshot}."id" ORDER BY ${TableName.SecretVersion}."createdAt") as rank`
          )
        )
        .orderBy(`${TableName.Snapshot}.createdAt`, "desc")
        .where(`${TableName.Snapshot}.folderId`, folderId);
      const data = await (tx || db.replicaNode())
        .with("w", query)
        .select("*")
        .from<Awaited<typeof query>[number]>("w")
        .andWhere("w.rank", "<", n);

      return sqlNestRelationships({
        data,
        key: "snapshotId",
        parentMapper: ({ snapshotId: id, snapshotCreatedAt: createdAt, snapshotUpdatedAt: updatedAt }) => ({
          id,
          folderId,
          createdAt,
          updatedAt
        }),
        childrenMapper: [
          {
            key: "id",
            label: "secretVersions" as const,
            mapper: (el) => SecretVersionsSchema.extend({ snapshotEnvId: z.string() }).parse(el),
            childrenMapper: [
              {
                key: "secretVersionTagId",
                label: "tags" as const,
                mapper: ({ secretVersionTagId, secretVersionTagSecretId, secretVersionTagSecretTagId }) => ({
                  id: secretVersionTagId,
                  secretVersionId: secretVersionTagSecretId,
                  secretTagId: secretVersionTagSecretTagId
                })
              }
            ]
          }
        ]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretSnapshotDataById" });
    }
  };

  const deleteSnapshotsAboveLimit = async (folderId: string, n = 15, tx?: Knex) => {
    try {
      const query = await (tx || db)
        .with("to_delete", (qb) => {
          void qb
            .select("id")
            .from(TableName.Snapshot)
            .where("folderId", folderId)
            .orderBy("createdAt", "desc")
            .offset(n);
        })
        .from(TableName.Snapshot)
        .whereIn("id", (qb) => {
          void qb.select("id").from("to_delete");
        })
        .delete();
      return query;
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteSnapshotsAboveLimit" });
    }
  };

  return {
    ...secretSnapshotOrm,
    findById,
    findLatestSnapshotByFolderId,
    findRecursivelySnapshots,
    findRecursivelySnapshotsV2Bridge,
    countOfSnapshotsByFolderId,
    findSecretSnapshotDataById,
    findSecretSnapshotV2DataById,
    pruneExcessSnapshots,
    findNSecretV1SnapshotByFolderId,
    deleteSnapshotsAboveLimit
  };
};
