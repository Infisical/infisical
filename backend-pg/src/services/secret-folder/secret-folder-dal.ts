import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  TableName,
  TProjectEnvironments,
  TSecretFolders,
  TSecretFoldersUpdate
} from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
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

const sqlFindSecretPathByFolderId = (db: Knex, projectId: string, folderIds: string[]) =>
  db
    .withRecursive("parent", (baseQb) => {
      // first remember our folders are connected as a link list or known as adjacency list
      // Thus each node has connection to parent node
      // we first find the folder given in folder id
      baseQb
        .from(TableName.SecretFolder)
        .select(selectAllTableCols(TableName.SecretFolder))
        .select({
          // this is for root condition
          //  if the given folder id is root folder id then intial path is set as / instead of /root
          //  if not root folder the path here will be /<folder name>
          path: db.raw(
            `CONCAT('/', (CASE WHEN "parentId" is NULL THEN '' ELSE ${TableName.SecretFolder}.name END))`
          ),
          child: db.raw("NULL::uuid")
        })
        .join(
          TableName.Environment,
          `${TableName.SecretFolder}.envId`,
          `${TableName.Environment}.id`
        )
        .where({ projectId })
        .whereIn(`${TableName.SecretFolder}.id`, folderIds)
        .union((qb) =>
          // then we keep going up
          // until parent id is null
          qb
            .select(selectAllTableCols(TableName.SecretFolder))
            .select({
              // then we join join this folder name behind previous as we are going from child to parent
              // the root folder check is used to avoid last / and also root name in folders
              path: db.raw(
                `CONCAT( CASE 
                  WHEN  ${TableName.SecretFolder}."parentId" is NULL THEN '' 
                  ELSE  CONCAT('/', secret_folders.name) 
                END, parent.path )`
              ),
              child: db.raw("COALESCE(parent.child, parent.id)")
            })
            .from(TableName.SecretFolder)
            .join("parent", "parent.parentId", `${TableName.SecretFolder}.id`)
        );
    })
    .select("*")
    .from<TSecretFolders & { child: string | null; path: string }>("parent");

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

  // used in folder creation
  // even if its the original given /path1/path2
  // it will stop automatically at /path2
  const findClosestFolder = async (
    projectId: string,
    environment: string,
    path: string,
    tx?: Knex
  ) => {
    try {
      const folder = await sqlFindFolderByPathQuery(tx || db, projectId, environment, path)
        .orderBy("depth", "desc")
        .first();
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

  // this is used to do an inverse query in folders
  // that is instances in which for a given folderid find the secret path
  const findSecretPathByFolderIds = async (projectId: string, folderIds: string[], tx?: Knex) => {
    try {
      const folders = await sqlFindSecretPathByFolderId(tx || db, projectId, folderIds);
      const rootFolders = groupBy(
        folders.filter(({ parentId }) => parentId === null),
        (i) => i.child || i.id // root condition then child and parent will null
      );
      return folderIds.map((folderId) => rootFolders[folderId]?.[0]);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by secret path" });
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

  return {
    ...secretFolderOrm,
    update,
    findBySecretPath,
    findById,
    findByManySecretPath,
    findSecretPathByFolderIds,
    findClosestFolder
  };
};
