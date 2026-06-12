import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretFolders } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { buildChildrenMap, resolvePathToFolder } from "@app/services/secret-folder/secret-folder-fns";

export type TSecretHttpProxyConfigDALFactory = ReturnType<typeof secretHttpProxyConfigDALFactory>;

export const secretHttpProxyConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.SecretHttpProxyConfig);

  const findBySecretId = async (secretId: string, tx?: Knex) => {
    return orm.findOne({ secretId }, tx);
  };

  const findBySecretIds = async (secretIds: string[], tx?: Knex) => {
    const queryDb = tx || db.replicaNode();
    return queryDb(TableName.SecretHttpProxyConfig).whereIn("secretId", secretIds).select("*");
  };

  const findByEnvironmentAndPath = async (projectId: string, envSlug: string, secretPath: string, tx?: Knex) => {
    const queryDb = tx || db.replicaNode();

    const allFolders = await queryDb(TableName.SecretFolder)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .where(`${TableName.Environment}.projectId`, projectId)
      .where(`${TableName.Environment}.slug`, envSlug)
      .select(selectAllTableCols(TableName.SecretFolder)) as TSecretFolders[];

    if (!allFolders.length) return [];

    const pathSegments = secretPath.split("/").filter(Boolean);
    const childrenMap = buildChildrenMap(allFolders);
    const targetFolder = resolvePathToFolder(childrenMap, pathSegments);

    if (!targetFolder) return [];

    return queryDb(TableName.SecretHttpProxyConfig)
      .join(TableName.SecretV2, `${TableName.SecretHttpProxyConfig}.secretId`, `${TableName.SecretV2}.id`)
      .where(`${TableName.SecretV2}.folderId`, targetFolder.id)
      .select(`${TableName.SecretHttpProxyConfig}.*`);
  };

  return {
    ...orm,
    findBySecretId,
    findBySecretIds,
    findByEnvironmentAndPath
  };
};
