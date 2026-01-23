import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretBlindIndexDALFactory = ReturnType<typeof secretBlindIndexDALFactory>;

export const secretBlindIndexDALFactory = (db: TDbClient) => {
  const secretBlindIndexOrm = ormify(db, TableName.SecretBlindIndex);

  const countOfSecretsWithNullSecretBlindIndex = async (projectId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.Secret)
        .leftJoin(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.Secret}.folderId`)
        .leftJoin(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .where({ projectId })
        .whereNull("secretBlindIndex")
        .count(`${TableName.Secret}.id` as "id");
      return doc?.[0]?.count || 0;
    } catch (error) {
      throw new DatabaseError({ error, name: "CountOfSecretWillNullSecretBlindIndex" });
    }
  };

  const findAllSecretsByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Secret)
        .leftJoin(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.Secret}.folderId`)
        .leftJoin(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .where({ projectId })
        .select(selectAllTableCols(TableName.Secret))
        .select(
          db.ref("slug").withSchema(TableName.Environment).as("environment"),
          db.ref("projectId").withSchema(TableName.Environment).as("workspace")
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "CountOfSecretWillNullSecretBlindIndex" });
    }
  };

  const findSecretsByProjectId = async (projectId: string, secretIds: string[], tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Secret)
        .leftJoin(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.Secret}.folderId`)
        .leftJoin(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .where({ projectId })
        .whereIn(`${TableName.Secret}.id`, secretIds)
        .select(selectAllTableCols(TableName.Secret))
        .select(
          db.ref("slug").withSchema(TableName.Environment).as("environment"),
          db.ref("projectId").withSchema(TableName.Environment).as("workspace")
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "CountOfSecretWillNullSecretBlindIndex" });
    }
  };

  return {
    ...secretBlindIndexOrm,
    findSecretsByProjectId,
    countOfSecretsWithNullSecretBlindIndex,
    findAllSecretsByProjectId
  };
};
