import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretFolders, TSecretFoldersUpdate } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { groupBy, removeTrailingSlash, unique } from "@app/lib/fn";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { isValidSecretPath } from "@app/lib/validator";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { SecretsOrderBy } from "@app/services/secret/secret-types";

import {
  buildChildrenMap,
  buildFolderIdMap,
  buildFolderPath,
  resolveClosestFolder,
  resolvePathToFolder
} from "./secret-folder-fns";
import { TFindFoldersDeepByParentIdsDTO } from "./secret-folder-types";

export const validateFolderName = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Hyphen,
  CharacterType.Underscore
]);

export type TSecretFolderDALFactory = ReturnType<typeof secretFolderDALFactory>;
// never change this. If u do write a migration for it
export const ROOT_FOLDER_NAME = "root";
export const secretFolderDALFactory = (db: TDbClient) => {
  const secretFolderOrm = ormify(db, TableName.SecretFolder);

  const findBySecretPath = async (projectId: string, environment: string, path: string, tx?: Knex) => {
    const isValidPath = isValidSecretPath(path);
    if (!isValidPath)
      throw new BadRequestError({
        message: "Invalid secret path. Only alphanumeric characters, dashes, and underscores are allowed."
      });
    const formatedPath = removeTrailingSlash(path);
    const pathSegments = formatedPath.split("/").filter(Boolean);
    if (pathSegments.some((segment) => !validateFolderName(segment))) {
      throw new BadRequestError({ message: "Invalid folder name" });
    }

    try {
      const folders = await (tx || db.replicaNode())(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .where(`${TableName.Environment}.slug`, environment)
        .select(
          selectAllTableCols(TableName.SecretFolder),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        );

      const childrenMap = buildChildrenMap(folders);
      const folder = resolvePathToFolder(childrenMap, pathSegments);
      if (!folder) return;

      const envInfo = folders[0] as (typeof folders)[0] & { envSlug: string; envName: string };
      const { envId: id, envName: name, envSlug: slug } = envInfo;
      return { ...folder, envId: id, path: formatedPath, projectId, environment: { id, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by secret path" });
    }
  };

  // finds folders by path for multiple envs
  const findBySecretPathMultiEnv = async (projectId: string, environments: string[], path: string, tx?: Knex) => {
    const isValidPath = isValidSecretPath(path);
    if (!isValidPath)
      throw new BadRequestError({
        message: "Invalid secret path. Only alphanumeric characters, dashes, and underscores are allowed."
      });

    const formatedPath = removeTrailingSlash(path);
    const pathSegments = formatedPath.split("/").filter(Boolean);
    if (pathSegments.some((segment) => !validateFolderName(segment))) {
      throw new BadRequestError({ message: "Invalid folder name" });
    }

    try {
      const allFolders = await (tx || db.replicaNode())(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereIn(`${TableName.Environment}.slug`, environments)
        .select(
          selectAllTableCols(TableName.SecretFolder),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        );

      const foldersByEnv = groupBy(allFolders, (f) => f.envId);

      const results: (TSecretFolders & {
        envId: string;
        path: string;
        projectId: string;
        environment: { id: string; name: string; slug: string };
      })[] = [];

      for (const envId of Object.keys(foldersByEnv)) {
        const envFolders = foldersByEnv[envId];
        const childrenMap = buildChildrenMap(envFolders);
        const folder = resolvePathToFolder(childrenMap, pathSegments);
        if (folder) {
          const envInfo = envFolders[0] as (typeof envFolders)[0] & { envSlug: string; envName: string };
          results.push({
            ...folder,
            envId: envInfo.envId,
            path: formatedPath,
            projectId,
            environment: { id: envInfo.envId, name: envInfo.envName, slug: envInfo.envSlug }
          });
        }
      }

      return results;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find folders by secret path multi env" });
    }
  };

  // used in folder creation
  // even if its the original given /path1/path2
  // it will stop automatically at /path2
  const findClosestFolder = async (projectId: string, environment: string, path: string, tx?: Knex) => {
    const isValidPath = isValidSecretPath(path);
    if (!isValidPath)
      throw new BadRequestError({
        message: "Invalid secret path. Only alphanumeric characters, dashes, and underscores are allowed."
      });

    const formatedPath = removeTrailingSlash(path);
    const pathSegments = formatedPath.split("/").filter(Boolean);
    if (pathSegments.some((segment) => !validateFolderName(segment))) {
      throw new BadRequestError({ message: "Invalid folder name" });
    }

    try {
      const folders = await (tx || db.replicaNode())(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .where(`${TableName.Environment}.slug`, environment)
        .select(
          selectAllTableCols(TableName.SecretFolder),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        );

      const childrenMap = buildChildrenMap(folders);
      const folder = resolveClosestFolder(childrenMap, pathSegments);
      if (!folder) return;

      // Compute the actual path of the resolved folder
      const idMap = buildFolderIdMap(folders);
      const resolvedPath = buildFolderPath(folder, idMap);

      const envInfo = folders[0] as (typeof folders)[0] & { envSlug: string; envName: string };
      return {
        ...folder,
        envId: envInfo.envId,
        path: resolvedPath,
        projectId,
        environment: { id: envInfo.envId, name: envInfo.envName, slug: envInfo.envSlug }
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by secret path" });
    }
  };

  const findByManySecretPath = async (query: Array<{ envId: string; secretPath: string }>, tx?: Knex) => {
    try {
      const formatedQuery = query.map(({ secretPath, envId }) => ({
        envId,
        secretPath: removeTrailingSlash(secretPath)
      }));

      const uniqueEnvIds = unique(formatedQuery, (q) => q.envId).map((q) => q.envId);

      // Fetch all folders for these envs in one query
      const allEnvFolders = await (tx || db.replicaNode())(TableName.SecretFolder).whereIn("envId", uniqueEnvIds);

      const foldersByEnv = groupBy(allEnvFolders, (f) => f.envId);

      // Build children maps per env
      const childrenMapByEnv: Record<string, Record<string, TSecretFolders[]>> = {};
      for (const envId of uniqueEnvIds) {
        childrenMapByEnv[envId] = buildChildrenMap(foldersByEnv[envId] || []);
      }

      return formatedQuery.map(({ envId, secretPath }) => {
        const pathSegments = secretPath.split("/").filter(Boolean);
        const childrenMap = childrenMapByEnv[envId];
        if (!childrenMap) return undefined;

        const folder = resolvePathToFolder(childrenMap, pathSegments);
        if (!folder) return undefined;

        return { ...folder, depth: pathSegments.length + 1, path: secretPath };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByManySecretPath" });
    }
  };

  // this is used to do an inverse query in folders
  // that is instances in which for a given folderid find the secret path
  const findSecretPathByFolderIds = async (projectId: string, folderIds: string[], tx?: Knex) => {
    try {
      const targetFolders = await (tx || db.replicaNode())(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .whereIn(`${TableName.SecretFolder}.id`, folderIds)
        .where(`${TableName.Environment}.projectId`, projectId)
        .select(
          selectAllTableCols(TableName.SecretFolder),
          db.ref("slug").withSchema(TableName.Environment).as("environmentSlug")
        );

      if (!targetFolders.length) {
        return folderIds.map(() => undefined);
      }

      const allEnvFolders = await (tx || db.replicaNode())(TableName.SecretFolder).whereIn(
        "envId",
        (tx || db.replicaNode())(TableName.SecretFolder)
          .select("envId")
          .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
          .whereIn(`${TableName.SecretFolder}.id`, folderIds)
          .where(`${TableName.Environment}.projectId`, projectId)
      );

      const idMap = buildFolderIdMap(allEnvFolders);

      // Map environmentSlug by envId from target folders
      const envSlugMap: Record<string, string> = {};
      for (const f of targetFolders) {
        envSlugMap[f.envId] = (f as typeof f & { environmentSlug: string }).environmentSlug;
      }

      return folderIds.map((folderId) => {
        const folder = idMap[folderId];
        if (!folder) return undefined;

        const path = buildFolderPath(folder, idMap);
        return { ...folder, path, environmentSlug: envSlugMap[folder.envId] };
      });
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
      const folder = await (tx || db.replicaNode())(TableName.SecretFolder)
        .where({ [`${TableName.SecretFolder}.id` as "id"]: id })
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .select(selectAllTableCols(TableName.SecretFolder))
        .select(
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("version").withSchema(TableName.Project).as("projectVersion")
        )
        .first();
      if (folder) {
        const { envId, envName, envSlug, ...el } = folder;
        return { ...el, environment: { envId, envName, envSlug }, envId };
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  // special query for project migration
  const findByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const folders = await (tx || db.replicaNode())(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .select(selectAllTableCols(TableName.SecretFolder))
        .where({ projectId })
        .select(
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("version").withSchema(TableName.Project).as("projectVersion")
        );
      return folders;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  // find project folders for multiple envs
  const findByMultiEnv = async (
    {
      environmentIds,
      parentIds,
      search,
      limit,
      offset = 0,
      orderBy = SecretsOrderBy.Name,
      orderDirection = OrderByDirection.ASC
    }: {
      environmentIds: string[];
      parentIds: string[];
      search?: string;
      limit?: number;
      offset?: number;
      orderBy?: SecretsOrderBy;
      orderDirection?: OrderByDirection;
    },
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.SecretFolder)
        .whereIn("parentId", parentIds)
        .whereIn("envId", environmentIds)
        .where("isReserved", false)
        .where((bd) => {
          if (search) {
            void bd.whereILike(`${TableName.SecretFolder}.name`, `%${search}%`);
          }
        })
        .leftJoin(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .select(
          selectAllTableCols(TableName.SecretFolder),
          db.raw(
            `DENSE_RANK() OVER (ORDER BY ${TableName.SecretFolder}."name" COLLATE "en-x-icu" ${orderDirection === OrderByDirection.ASC ? "ASC" : "DESC"}) as rank`
          ),
          db.ref("slug").withSchema(TableName.Environment).as("environment")
        )
        .orderByRaw(
          `${TableName.SecretFolder}.?? COLLATE "en-x-icu" ${orderDirection === OrderByDirection.ASC ? "ASC" : "DESC"}`,
          [orderBy]
        );

      if (limit) {
        const rankOffset = offset + 1; // ranks start from 1
        return await (tx || db)
          .with("w", query)
          .select("*")
          .from<Awaited<typeof query>[number]>("w")
          .where("w.rank", ">=", rankOffset)
          .andWhere("w.rank", "<", rankOffset + limit)
          .orderByRaw(`"w".?? COLLATE "en-x-icu" ${orderDirection === OrderByDirection.ASC ? "ASC" : "DESC"}`, [
            orderBy
          ]);
      }

      const folders = await query;

      return folders;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find folders multi env" });
    }
  };

  const findByEnvsDeep = async (
    { parentIds, orderBy = SecretsOrderBy.Name, orderDirection = OrderByDirection.ASC }: TFindFoldersDeepByParentIdsDTO,
    tx?: Knex
  ) => {
    try {
      const parentFolders = await (tx || db.replicaNode())(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .whereIn(`${TableName.SecretFolder}.id`, parentIds)
        .select(
          selectAllTableCols(TableName.SecretFolder),
          db.ref("slug").withSchema(TableName.Environment).as("environment")
        );

      if (!parentFolders.length) return [];

      const allFolders = await (tx || db.replicaNode())(TableName.SecretFolder)
        .whereIn("envId", (tx || db.replicaNode())(TableName.SecretFolder).select("envId").whereIn("id", parentIds))
        .where("isReserved", false);

      const envSlugMap: Record<string, string> = {};
      for (const pf of parentFolders) {
        envSlugMap[pf.envId] = (pf as typeof pf & { environment: string }).environment;
      }

      // Include parent folders themselves
      const allFoldersIncludingParents = [
        ...allFolders,
        ...parentFolders.filter((pf) => !allFolders.some((f) => f.id === pf.id))
      ];

      const childrenMap = buildChildrenMap(allFoldersIncludingParents);

      const results: (TSecretFolders & { path: string; depth: number; environment: string })[] = [];

      const traverse = (folder: TSecretFolders, currentPath: string, depth: number, environment: string) => {
        results.push({ ...folder, path: currentPath, depth, environment });
        const children = (childrenMap[folder.id] || []).filter((child) => !child.isReserved);
        for (const child of children) {
          const childPath = currentPath === "/" ? `/${child.name}` : `${currentPath}/${child.name}`;
          traverse(child, childPath, depth + 1, environment);
        }
      };

      for (const parent of parentFolders) {
        traverse(parent, "/", 0, envSlugMap[parent.envId]);
      }

      results.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        const nameA = a[orderBy as keyof TSecretFolders] as string;
        const nameB = b[orderBy as keyof TSecretFolders] as string;
        const cmp = nameA.localeCompare(nameB, "en");
        return orderDirection === OrderByDirection.ASC ? cmp : -cmp;
      });

      return results;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByEnvsDeep" });
    }
  };

  const findFoldersByRootAndIds = async ({ rootId, folderIds }: { rootId: string; folderIds: string[] }, tx?: Knex) => {
    try {
      const rootFolder = await (tx || db.replicaNode())(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.SecretFolder}.id`, rootId)
        .select(
          selectAllTableCols(TableName.SecretFolder),
          db.ref("slug").withSchema(TableName.Environment).as("environment")
        )
        .first();

      if (!rootFolder) return [];

      const allFolders = await (tx || db.replicaNode())(TableName.SecretFolder).where("envId", rootFolder.envId);

      const childrenMap = buildChildrenMap(allFolders);
      const folderIdSet = new Set(folderIds);
      const { environment } = rootFolder as typeof rootFolder & { environment: string };

      const results: (TSecretFolders & { path: string; depth: number; environment: string })[] = [];

      const traverse = (folder: TSecretFolders, currentPath: string, depth: number) => {
        if (folderIdSet.has(folder.id)) {
          results.push({ ...folder, path: currentPath, depth, environment });
        }
        const children = (childrenMap[folder.id] || []).filter((child) => !child.isReserved);
        for (const child of children) {
          const childPath = currentPath === "/" ? `/${child.name}` : `${currentPath}/${child.name}`;
          traverse(child, childPath, depth + 1);
        }
      };

      traverse(rootFolder, "/", 0);

      results.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.name.localeCompare(b.name, "en");
      });

      return results;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindFoldersByRootAndIds" });
    }
  };

  const findByParentId = async (parentId: string, tx?: Knex) => {
    try {
      const folders = await (tx || db.replicaNode())(TableName.SecretFolder)
        .where({ parentId })
        .andWhere({ isReserved: false })
        .select(selectAllTableCols(TableName.SecretFolder));
      return folders;
    } catch (error) {
      throw new DatabaseError({ error, name: "findByParentId" });
    }
  };

  const findByEnvId = async (envId: string, tx?: Knex) => {
    try {
      const folders = await (tx || db.replicaNode())(TableName.SecretFolder)
        .where({ envId })
        .andWhere({ isReserved: false })
        .select(selectAllTableCols(TableName.SecretFolder));
      return folders;
    } catch (error) {
      throw new DatabaseError({ error, name: "findByEnvId" });
    }
  };

  return {
    ...secretFolderOrm,
    update,
    findBySecretPath,
    findBySecretPathMultiEnv,
    findById,
    findByManySecretPath,
    findSecretPathByFolderIds,
    findClosestFolder,
    findByProjectId,
    findByMultiEnv,
    findByEnvsDeep,
    findByParentId,
    findByEnvId,
    findFoldersByRootAndIds
  };
};
