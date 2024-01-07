import dotenv from "dotenv";

import { initDbConnection } from "./db";
import {
  SecretVersionsSchema,
  TableName,
  TSecretFolderVersions,
  TSecrets,
  TSecretSnapshotFolders,
  TSecretSnapshots,
  TSecretVersions} from "./db/schemas";
import { selectAllTableCols, sqlNestRelationships } from "./lib/knex";

dotenv.config();
// const db = initDbConnection(process.env.DB_CONNECTION_URI);

// const main = async () => {
//   const folders = db
//     .withRecursive("parent", (qb) => {
//       qb.select({
//         depth: 1,
//         path: db.raw("'/'")
//       })
//         .select(selectAllTableCols(db, TableName.SecretFolder))
//         .from(TableName.SecretFolder)
//         .join(
//           TableName.Environment,
//           `${TableName.SecretFolder}.envId`,
//           `${TableName.Environment}.id`
//         )
//         .where({
//           projectId: "01c10de1-8743-490f-9c8a-7a19c4dc72a9",
//           parentId: null
//         })
//         .where(`${TableName.Environment}.slug`, "dev")
//         .union((qb) =>
//           qb
//             .select({
//               depth: db.raw("parent.depth + 1"),
//               path: db.raw(
//                 "CONCAT((CASE WHEN parent.path = '/' THEN '' ELSE parent.path END),'/', secret_folders.name)"
//               )
//             })
//             .select(selectAllTableCols(db, TableName.SecretFolder))
//             .whereRaw(
//               `depth = array_position(ARRAY[${[1, 2]
//                 .map((_) => "?")
//                 .join(",")}]::varchar[], secret_folders.name,depth)`,
//               [...["ui", "design"]]
//             )
//             .from(TableName.SecretFolder)
//             .join("parent", "parent.id", `${TableName.SecretFolder}.parentId`)
//         );
//     })
//     .select("*")
//     .from("parent")
//     .orderBy("depth", "desc")
//     .first();
//   console.log(folders.toSQL());
//   console.log(JSON.stringify(await folders, null, 4));
//   process.exit(0);
// };
//
const main = async () => {
  const db = initDbConnection(process.env.DB_CONNECTION_URI);

  const folders = db
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
        .where(`${TableName.Snapshot}.id`, "abe694d3-957f-40f5-a907-952d3e5ccaf1")
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
      db(TableName.SecretVersion)
        .groupBy("secretId")
        .select("secretId")
        .max("version")
        .as("secGroupByMaxVersion"),
      `${TableName.SecretVersion}.secretId`,
      "secGroupByMaxVersion.secretId"
    )
    .leftJoin<{ latestFolderVersion: number }>(
      db(TableName.SecretFolderVersion)
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
  console.log(folders.toSQL());
  const data = await folders;
  // console.log(data);
  const formated = sqlNestRelationships({
    data,
    key: "snapshotId",
    parentMapper: ({ snapshotId: id }) => ({
      id
    }),
    childrenMapper: [
      {
        key: "id",
        label: "secretVersions",
        mapper: (el) => ({
          ...SecretVersionsSchema.parse(el),
          latestSecretVersion: el.latestSecretVersion
        })
      },
      {
        key: "folderVerId",
        label: "folderVersion",
        mapper: ({ folderVerId: id, folderVerName: name, latestFolderVersion }) => ({
          id,
          name,
          version: latestFolderVersion
        })
      }
    ] as const
  });
  console.log(formated);
  process.exit(0);
};
main();
