import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretTagDALFactory = ReturnType<typeof secretTagDALFactory>;

export const secretTagDALFactory = (db: TDbClient) => {
  const secretTagOrm = ormify(db, TableName.SecretTag);
  const secretJnTagOrm = ormify(db, TableName.JnSecretTag);
  const secretV2JnTagOrm = ormify(db, TableName.SecretV2JnTag);
  const secretVersionV2TagOrm = ormify(db, TableName.SecretVersionV2Tag);

  const findManyTagsById = async (projectId: string, ids: string[], tx?: Knex) => {
    try {
      const tags = await (tx || db.replicaNode())(TableName.SecretTag).where({ projectId }).whereIn("id", ids);
      return tags;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all by ids" });
    }
  };

  const deleteTagsManySecret = async (projectId: string, secretIds: string[], tx?: Knex) => {
    try {
      const tags = await (tx || db)(TableName.JnSecretTag)
        .join(TableName.SecretTag, `${TableName.JnSecretTag}.${TableName.SecretTag}Id`, `${TableName.SecretTag}.id`)
        .where("projectId", projectId)
        .whereIn(`${TableName.Secret}Id`, secretIds)
        .delete()
        .returning("*");
      return tags;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all by ids" });
    }
  };

  // special query for migration
  const findSecretTagsByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const tags = await (tx || db.replicaNode())(TableName.JnSecretTag)
        .join(TableName.SecretTag, `${TableName.JnSecretTag}.secret_tagsId`, `${TableName.SecretTag}.id`)
        .where({ projectId })
        .select(selectAllTableCols(TableName.JnSecretTag));
      return tags;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all by ids" });
    }
  };

  const findSecretTagsByVersionId = async (versionId: string, tx?: Knex) => {
    try {
      const tags = await (tx || db.replicaNode())(TableName.SecretVersionV2Tag)
        .where(`${TableName.SecretVersionV2Tag}.${TableName.SecretVersionV2}Id`, versionId)
        .select(selectAllTableCols(TableName.SecretVersionV2Tag));
      return tags;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all by version id" });
    }
  };

  const findSecretTagsBySecretId = async (secretId: string, tx?: Knex) => {
    try {
      const tags = await (tx || db.replicaNode())(TableName.SecretV2JnTag)
        .where(`${TableName.SecretV2JnTag}.${TableName.SecretV2}Id`, secretId)
        .select(selectAllTableCols(TableName.SecretV2JnTag));
      return tags;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all by secret id" });
    }
  };

  return {
    ...secretTagOrm,
    saveTagsToSecret: secretJnTagOrm.insertMany,
    deleteTagsToSecret: secretJnTagOrm.delete,
    saveTagsToSecretV2: secretV2JnTagOrm.batchInsert,
    deleteTagsToSecretV2: secretV2JnTagOrm.delete,
    saveTagsToSecretVersionV2: secretVersionV2TagOrm.insertMany,
    findSecretTagsByProjectId,
    deleteTagsManySecret,
    findManyTagsById,
    findSecretTagsByVersionId,
    findSecretTagsBySecretId
  };
};
