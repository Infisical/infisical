import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  SecretVersionsSchema,
  TableName,
  TSecretFolderVersions,
  TSecretSnapshotFolders,
  TSecretSnapshots,
  TSecretVersions
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TSnapshotDALFactory = ReturnType<typeof snapshotDALFactory>;

export const snapshotDALFactory = (db: TDbClient) => {
  const secretSnapshotOrm = ormify(db, TableName.Snapshot);

  const findById = async (id: string, tx?: Knex) => {
    try {
      const data = await (tx || db)(TableName.Snapshot)
        .where(`${TableName.Snapshot}.id`, id)
        .join(TableName.Environment, `${TableName.Snapshot}.envId`, `${TableName.Environment}.id`)
        .select(selectAllTableCols(TableName.Snapshot))
        .select(
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug")
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
      const doc = await (tx || db)(TableName.Snapshot)
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
      const data = await (tx || db)(TableName.Snapshot)
        .where(`${TableName.Snapshot}.id`, snapshotId)
        .join(TableName.Environment, `${TableName.Snapshot}.envId`, `${TableName.Environment}.id`)
        .leftJoin(
          TableName.SnapshotSecret,
          `${TableName.Snapshot}.id`,
          `${TableName.SnapshotSecret}.snapshotId`
        )
        .leftJoin(
          TableName.SecretVersion,
          `${TableName.SnapshotSecret}.secretVersionId`,
          `${TableName.SecretVersion}.id`
        )
        .leftJoin(
          TableName.SnapshotFolder,
          `${TableName.SnapshotFolder}.snapshotId`,
          `${TableName.Snapshot}.id`
        )
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
          db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("folderVerId")
        );
      return sqlNestRelationships({
        data,
        key: "snapshotId",
        parentMapper: ({
          snapshotId: id,
          projectId,
          envId,
          envSlug,
          envName,
          snapshotCreatedAt: createdAt,
          snapshotUpdatedAt: updatedAt
        }) => ({
          id,
          projectId,
          createdAt,
          updatedAt,
          environment: { id: envId, slug: envSlug, name: envName }
        }),
        childrenMapper: [
          {
            key: "id",
            label: "secretVersions" as const,
            mapper: (el) => SecretVersionsSchema.parse(el)
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
      const data = await (tx || db)
        .withRecursive("parent", (qb) => {
          qb.from(TableName.Snapshot)
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
            .union((cb) =>
              cb
                .select(selectAllTableCols(TableName.Snapshot))
                .select({ depth: db.raw("parent.depth + 1") })
                .select(
                  db.ref("name").withSchema(TableName.SecretFolderVersion).as("folderVerName"),
                  db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("folderVerId")
                )
                .from(TableName.Snapshot)
                .join<TSecretSnapshots, TSecretSnapshots & { secretId: string; max: number }>(
                  db(TableName.Snapshot)
                    .groupBy("folderId")
                    .max("createdAt")
                    .select("folderId")
                    .as("latestVersion"),
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
        .leftJoin<TSecretSnapshots>(
          TableName.SnapshotSecret,
          `parent.id`,
          `${TableName.SnapshotSecret}.snapshotId`
        )
        .leftJoin<TSecretVersions>(
          TableName.SecretVersion,
          `${TableName.SnapshotSecret}.secretVersionId`,
          `${TableName.SecretVersion}.id`
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
          db.ref("max").withSchema("folderGroupByMaxVersion").as("latestFolderVersion")
        );
      const formated = sqlNestRelationships({
        data,
        key: "snapshotId",
        parentMapper: ({
          snapshotId: id,
          snapshotFolderId: folderId,
          snapshotParentFolderId: parentFolderId
        }) => ({
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
              latestSecretVersion: el.latestSecretVersion
            })
          },
          {
            key: "folderVerId",
            label: "folderVersion" as const,
            mapper: ({ folderVerId: id, folderVerName: name, latestFolderVersion }) => ({
              id,
              name,
              latestFolderVersion
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
      const docs = await (tx || db)(TableName.Snapshot)
        .where(`${TableName.Snapshot}.folderId`, folderId)
        .join<TSecretSnapshots>(
          (tx || db)(TableName.Snapshot)
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

  return {
    ...secretSnapshotOrm,
    findById,
    findLatestSnapshotByFolderId,
    findRecursivelySnapshots,
    countOfSnapshotsByFolderId,
    findSecretSnapshotDataById
  };
};
