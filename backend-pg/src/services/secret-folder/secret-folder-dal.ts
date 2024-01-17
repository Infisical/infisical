import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  TableName,
  TProjectEnvironments,
  TSecretFolders,
  TSecretFoldersUpdate
} from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export const validateFolderName = (folderName: string) => {
  const validNameRegex = /^[a-zA-Z0-9-_]+$/;
  return validNameRegex.test(folderName);
};

const sqlFindMultipleFolderByEnvPathQuery = (
  db: Knex,
  query: Array<{ envId: string; secretPath: string }>
) => {
  // this is removing an trailing slash like /folder1/folder2/ -> /folder1/folder2
  const formatedQuery = query.map(({ envId, secretPath }) => {
    const formatedPath =
      secretPath.at(-1) === "/" && secretPath.length > 1 ? secretPath.slice(0, -1) : secretPath;
    const segments = formatedPath.split("/").filter(Boolean);
    if (segments.some((segment) => !validateFolderName(segment))) {
      throw new BadRequestError({ message: "Invalid folder name" });
    }
    return {
      envId,
      secretPath: segments
    };
  });
  // next goal to sanitize saw the raw sql query is safe
  // for this we ensure folder name contains only string and - nothing else

  return db
    .withRecursive("parent", (baseQb) => {
      // first remember our folders are connected as a link list or known as adjacency list
      // Thus each node has connection to parent node
      // for a given path from root we recursively reach to the leaf path or till we get null
      // the below query is the base case where we select root folder which has parent folder id as null
      baseQb
        .select({
          depth: 1,
          // latestFolderVerId: db.raw("NULL::uuid"),
          path: db.raw("'/'")
        })
        .from(TableName.SecretFolder)
        .where({
          parentId: null
        })
        .whereIn(
          "envId",
          formatedQuery.map(({ envId }) => envId)
        )
        .select(selectAllTableCols(TableName.SecretFolder))
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
            .select(selectAllTableCols(TableName.SecretFolder))
            .where((wb) =>
              formatedQuery.map(({ secretPath }) =>
                wb.orWhereRaw(
                  `depth = array_position(ARRAY[${secretPath
                    .map(() => "?")
                    .join(",")}]::varchar[], ${TableName.SecretFolder}.name,depth)`,
                  [...secretPath]
                )
              )
            )
            .from(TableName.SecretFolder)
            .join("parent", (bd) =>
              bd
                .on("parent.id", `${TableName.SecretFolder}.parentId`)
                .andOn("parent.envId", `${TableName.SecretFolder}.envId`)
            )
        );
    })
    .select("*")
    .from<TSecretFolders & { depth: number; path: string }>("parent");
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
          // latestFolderVerId: db.raw("NULL::uuid"),
          path: db.raw("'/'")
        })
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
        .select(selectAllTableCols(TableName.SecretFolder))
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
            .select(selectAllTableCols(TableName.SecretFolder))
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
    .from<TSecretFolders & { depth: number; path: string }>("parent")
    .leftJoin<TProjectEnvironments>(
      TableName.Environment,
      `${TableName.Environment}.id`,
      "parent.envId"
    )
    .select<
      TSecretFolders & {
        depth: number;
        path: string;
        envId: string;
        envSlug: string;
        envName: string;
        projectId: string;
      }
    >(
      selectAllTableCols("parent" as TableName.SecretFolder),
      db.ref("id").withSchema(TableName.Environment).as("envId"),
      db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
      db.ref("name").withSchema(TableName.Environment).as("envName"),
      db.ref("projectId").withSchema(TableName.Environment)
    );
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
      if (!folder) return;
      const { envId: id, envName: name, envSlug: slug, ...el } = folder;
      return { ...el, envId: id, environment: { id, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by secret path" });
    }
  };

  const findByManySecretPath = async (
    query: Array<{ envId: string; secretPath: string }>,
    tx?: Knex
  ) => {
    try {
      const folders = await sqlFindMultipleFolderByEnvPathQuery(tx || db, query);
      return query.map(({ envId, secretPath }) =>
        folders.find(
          ({ path: targetPath, envId: targetEnvId }) =>
            targetPath === secretPath && targetEnvId === envId
        )
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByManySecretPath" });
    }
  };

  const update = async (filter: Partial<TSecretFolders>, data: TSecretFoldersUpdate, tx?: Knex) => {
    try {
      const folder = await (tx || db)(TableName.SecretFolder)
        .where(filter)
        .update(data)
        .increment("version", 1)
        .returning("*");
      return folder;
    } catch (error) {
      throw new DatabaseError({ error, name: "SecretFolderUpdate" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const folder = await (tx || db)(TableName.SecretFolder)
        .where({ [`${TableName.SecretFolder}.id` as "id"]: id })
        .join(
          TableName.Environment,
          `${TableName.SecretFolder}.envId`,
          `${TableName.Environment}.id`
        )
        .select(selectAllTableCols(TableName.SecretFolder))
        .select(
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("projectId").withSchema(TableName.Environment)
        )
        .first();
      if (folder) {
        const { envId, envName, envSlug, ...el } = folder;
        return { ...el, environment: { envId, envName, envSlug } };
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  return { ...secretFolderOrm, update, findBySecretPath, findById, findByManySecretPath };
};
