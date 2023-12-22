import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretFolders } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export const validateFolderName = (folderName: string) => {
  const validNameRegex = /^[a-zA-Z0-9-_]+$/;
  return validNameRegex.test(folderName);
};

const sqlFindFolderByPathQuery = (
  db: Knex,
  projectId: string,
  environment: string,
  secretPath: string
) => {
  // this is removing an trailing slash like /folder1/folder2/ -> /folder1/folder2
  const formatedPath =
    secretPath.at(-1) === "/" && secretPath.length > 1 ? secretPath.slice(0, -1) : secretPath;
  // next goal to sanitize saw the raw sql query is safe
  // for this we ensure folder name contains only string and - nothing else
  const pathSegments = formatedPath.split("/").filter(Boolean);
  if (pathSegments.some((segment) => !validateFolderName(segment))) {
    throw new BadRequestError({ message: "Invalid folder name" });
  }

  return db
    .withRecursive("parent", (baseQb) => {
      // first remember our folders are connected as a link list or known as adjacency list
      // Thus each node has connection to parent node
      // for a given path from root we recursively reach to the leaf path or till we get null
      // the below query is the base case where we select root folder which has parent folder id as null
      baseQb
        .select({
          depth: 1,
          path: db.raw("'/'")
        })
        .select(selectAllTableCols(db, TableName.SecretFolder))
        .from(TableName.SecretFolder)
        .join(
          TableName.Environment,
          `${TableName.SecretFolder}.envId`,
          `${TableName.Environment}.id`
        )
        .where({
          projectId,
          parentId: null
        })
        .where(`${TableName.Environment}.slug`, environment)
        .union((qb) =>
          // for here on we keep going to next child node.
          // we also keep a measure of depth then we check the depth matches the array path segment and folder name
          // that is at depth 1 for a path /folder1/folder2 -> the name should be folder1
          qb
            .select({
              depth: db.raw("parent.depth + 1"),
              path: db.raw(
                "CONCAT((CASE WHEN parent.path = '/' THEN '' ELSE parent.path END),'/', secret_folders.name)"
              )
            })
            .select(selectAllTableCols(db, TableName.SecretFolder))
            .whereRaw(
              `depth = array_position(ARRAY[${pathSegments
                .map(() => "?")
                .join(",")}]::varchar[], secret_folders.name,depth)`,
              [...pathSegments]
            )
            .from(TableName.SecretFolder)
            .join("parent", "parent.id", `${TableName.SecretFolder}.parentId`)
        );
    })
    .select("*")
    .from<TSecretFolders & { depth: number; path: string }>("parent");
};

export type TSecretFolderDalFactory = ReturnType<typeof secretFolderDalFactory>;
// never change this. If u do write a migration for it
export const ROOT_FOLDER_NAME = "root";
export const secretFolderDalFactory = (db: TDbClient) => {
  const secretFolderOrm = ormify(db, TableName.SecretFolder);

  const findBySecretPath = async (
    projectId: string,
    environment: string,
    path: string,
    tx?: Knex
  ) => {
    try {
      const folder = await sqlFindFolderByPathQuery(tx || db, projectId, environment, path)
        .orderBy("depth", "desc")
        .first();
      if (folder && folder.path !== path) {
        return;
      }
      return folder;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by secret path" });
    }
  };

  return { ...secretFolderOrm, findBySecretPath };
};
