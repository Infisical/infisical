import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretImports } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { EnvironmentInfo, FolderInfo, FolderResult, SecretResult } from "./secret-import-types";

export type TSecretImportDALFactory = ReturnType<typeof secretImportDALFactory>;

export const secretImportDALFactory = (db: TDbClient) => {
  const secretImportOrm = ormify(db, TableName.SecretImport);

  // we are using postion based sorting as its a small list
  // this will return the last value of the position in a folder with secret imports
  const findLastImportPosition = async (folderId: string, tx?: Knex) => {
    const lastPos = await (tx || db.replicaNode())(TableName.SecretImport)
      .where({ folderId })
      .max("position", { as: "position" })
      .first();
    return lastPos?.position || 0;
  };

  const updateAllPosition = async (folderId: string, pos: number, targetPos: number, positionInc = 1, tx?: Knex) => {
    try {
      if (targetPos === -1) {
        // this means delete
        await (tx || db)(TableName.SecretImport)
          .where({ folderId })
          .andWhere("position", ">", pos)
          .decrement("position", positionInc);
        return;
      }

      if (targetPos > pos) {
        await (tx || db)(TableName.SecretImport)
          .where({ folderId })
          .where("position", "<=", targetPos)
          .andWhere("position", ">", pos)
          .decrement("position", positionInc);
      } else {
        await (tx || db)(TableName.SecretImport)
          .where({ folderId })
          .where("position", ">=", targetPos)
          .andWhere("position", "<", pos)
          .increment("position", positionInc);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Update position" });
    }
  };

  const find = async (
    {
      search,
      limit,
      offset,
      ...filter
    }: Partial<
      TSecretImports & {
        projectId: string;
        search?: string;
        limit?: number;
        offset?: number;
      }
    >,
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.SecretImport)
        .where(filter)
        .where((bd) => {
          if (search) {
            void bd.whereILike("importPath", `%${search}%`);
          }
        })
        .join(TableName.Environment, `${TableName.SecretImport}.importEnv`, `${TableName.Environment}.id`)
        .select(
          db.ref("*").withSchema(TableName.SecretImport) as unknown as keyof TSecretImports,
          db.ref("slug").withSchema(TableName.Environment),
          db.ref("name").withSchema(TableName.Environment),
          db.ref("id").withSchema(TableName.Environment).as("envId")
        )
        .orderBy("position", "asc");

      if (limit) {
        void query.limit(limit).offset(offset ?? 0);
      }

      const docs = await query;

      return docs.map(({ envId, slug, name, ...el }) => ({
        ...el,
        importEnv: { id: envId, slug, name }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret imports" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.SecretImport)
        .where({ [`${TableName.SecretImport}.id` as "id"]: id })
        .join(TableName.Environment, `${TableName.SecretImport}.importEnv`, `${TableName.Environment}.id`)
        .select(
          db.ref("*").withSchema(TableName.SecretImport) as unknown as keyof TSecretImports,
          db.ref("slug").withSchema(TableName.Environment),
          db.ref("name").withSchema(TableName.Environment),
          db.ref("id").withSchema(TableName.Environment).as("envId")
        )
        .first();

      if (!doc) {
        return null;
      }

      const { envId, slug, name, ...el } = doc;

      return {
        ...el,
        importEnv: { id: envId, slug, name }
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret imports" });
    }
  };

  const findByIds = async (ids: string[], tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretImport)
        .whereIn(`${TableName.SecretImport}.id`, ids)
        .join(TableName.Environment, `${TableName.SecretImport}.importEnv`, `${TableName.Environment}.id`)
        .select(
          db.ref("*").withSchema(TableName.SecretImport) as unknown as keyof TSecretImports,
          db.ref("slug").withSchema(TableName.Environment),
          db.ref("name").withSchema(TableName.Environment),
          db.ref("id").withSchema(TableName.Environment).as("envId")
        );

      return docs.map(({ envId, slug, name, ...el }) => ({
        ...el,
        importEnv: { id: envId, slug, name }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret imports by ids" });
    }
  };

  const getProjectImportCount = async (
    { search, ...filter }: Partial<TSecretImports & { projectId: string; search?: string }>,
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretImport)
        .where(filter)
        .where("isReplication", false)
        .where((bd) => {
          if (search) {
            void bd.whereILike("importPath", `%${search}%`);
          }
        })
        .join(TableName.Environment, `${TableName.SecretImport}.importEnv`, `${TableName.Environment}.id`)
        .count();

      return Number(docs[0]?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "get secret imports count" });
    }
  };

  const findByFolderIds = async (folderIds: string[], tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretImport)
        .whereIn("folderId", folderIds)
        .where("isReplication", false)
        .join(TableName.Environment, `${TableName.SecretImport}.importEnv`, `${TableName.Environment}.id`)
        .select(
          db.ref("*").withSchema(TableName.SecretImport) as unknown as keyof TSecretImports,
          db.ref("slug").withSchema(TableName.Environment),
          db.ref("name").withSchema(TableName.Environment),
          db.ref("id").withSchema(TableName.Environment).as("envId")
        )
        .orderBy("position", "asc");
      return docs.map(({ envId, slug, name, ...el }) => ({
        ...el,
        importEnv: { id: envId, slug, name }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret imports" });
    }
  };

  const getFolderImports = async (secretPath: string, environmentId: string, tx?: Knex) => {
    try {
      const folderImports = await (tx || db.replicaNode())(TableName.SecretImport)
        .where({ importPath: secretPath, importEnv: environmentId })
        .join(TableName.SecretFolder, `${TableName.SecretImport}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .select(db.ref("id").withSchema(TableName.SecretFolder).as("folderId"));
      return folderImports;
    } catch (error) {
      throw new DatabaseError({ error, name: "get secret imports" });
    }
  };

  const getFolderIsImportedBy = async (
    secretPath: string,
    environmentId: string,
    environment: string,
    projectId: string,
    tx?: Knex
  ) => {
    try {
      const folderImports = await (tx || db.replicaNode())(TableName.SecretImport)
        .where({ importPath: secretPath, importEnv: environmentId })
        .join(TableName.SecretFolder, `${TableName.SecretImport}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .select(
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.SecretFolder).as("folderName"),
          db.ref("id").withSchema(TableName.SecretFolder).as("folderId")
        );

      const secretReferences = await (tx || db.replicaNode())(TableName.SecretReferenceV2)
        .where({ secretPath, environment })
        .join(TableName.SecretV2, `${TableName.SecretReferenceV2}.secretId`, `${TableName.SecretV2}.id`)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .where(`${TableName.SecretFolder}.isReserved`, false)
        .select(
          db.ref("key").withSchema(TableName.SecretV2).as("secretId"),
          db.ref("name").withSchema(TableName.SecretFolder).as("folderName"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("id").withSchema(TableName.SecretFolder).as("folderId"),
          db.ref("secretKey").withSchema(TableName.SecretReferenceV2).as("referencedSecretKey"),
          db.ref("environment").withSchema(TableName.SecretReferenceV2).as("referencedSecretEnv")
        );

      const folderResults = folderImports.map(({ envName, envSlug, folderName, folderId }) => ({
        envName,
        envSlug,
        folderName,
        folderId
      }));

      const secretResults = secretReferences.map(
        ({ envName, envSlug, secretId, folderName, folderId, referencedSecretKey, referencedSecretEnv }) => ({
          envName,
          envSlug,
          secretId,
          folderName,
          folderId,
          referencedSecretKey,
          referencedSecretEnv
        })
      );

      type ResultItem = FolderResult | SecretResult;
      const allResults: ResultItem[] = [...folderResults, ...secretResults];

      type EnvFolderMap = {
        [envName: string]: {
          envSlug: string;
          folders: {
            [folderName: string]: {
              secrets: {
                secretId: string;
                referencedSecretKey: string;
                referencedSecretEnv: string;
              }[];
              folderId: string;
              folderImported: boolean;
            };
          };
        };
      };

      const groupedByEnv = allResults.reduce<EnvFolderMap>((acc, item) => {
        const env = item.envName;
        const folder = item.folderName;
        const { envSlug } = item;

        const updatedAcc = { ...acc };

        if (!updatedAcc[env]) {
          updatedAcc[env] = {
            envSlug,
            folders: {}
          };
        }

        if (!updatedAcc[env].folders[folder]) {
          updatedAcc[env].folders[folder] = { secrets: [], folderId: item.folderId, folderImported: false };
        }

        if ("secretId" in item && item.secretId) {
          updatedAcc[env].folders[folder].secrets = [
            ...updatedAcc[env].folders[folder].secrets,
            {
              secretId: item.secretId,
              referencedSecretKey: item.referencedSecretKey,
              referencedSecretEnv: item.referencedSecretEnv
            }
          ];
        } else {
          updatedAcc[env].folders[folder].folderImported = true;
        }

        return updatedAcc;
      }, {});

      const formattedResult: EnvironmentInfo[] = Object.keys(groupedByEnv).map((envName) => {
        const envData = groupedByEnv[envName];

        const folders: FolderInfo[] = Object.keys(envData.folders).map((folderName) => {
          const folderData = envData.folders[folderName];
          const hasSecrets = folderData.secrets.length > 0;

          return {
            folderName,
            folderId: folderData.folderId,
            folderImported: folderData.folderImported,
            ...(hasSecrets && { secrets: folderData.secrets })
          };
        });

        return {
          envName,
          envSlug: envData.envSlug,
          folders
        };
      });

      return formattedResult;
    } catch (error) {
      throw new DatabaseError({ error, name: "GetSecretImportsAndReferences" });
    }
  };

  return {
    ...secretImportOrm,
    find,
    findById,
    findByIds,
    findByFolderIds,
    findLastImportPosition,
    updateAllPosition,
    getProjectImportCount,
    getFolderIsImportedBy,
    getFolderImports
  };
};
