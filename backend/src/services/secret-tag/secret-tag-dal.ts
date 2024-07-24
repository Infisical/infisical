import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretTagDALFactory = ReturnType<typeof secretTagDALFactory>;

export const secretTagDALFactory = (db: TDbClient) => {
  const secretTagOrm = ormify(db, TableName.SecretTag);
  const secretJnTagOrm = ormify(db, TableName.JnSecretTag);
  const secretV2JnTagOrm = ormify(db, TableName.SecretV2JnTag);

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
  return {
    ...secretTagOrm,
    saveTagsToSecret: secretJnTagOrm.insertMany,
    deleteTagsToSecret: secretJnTagOrm.delete,
    saveTagsToSecretV2: secretV2JnTagOrm.insertMany,
    deleteTagsToSecretV2: secretV2JnTagOrm.delete,
    findSecretTagsByProjectId,
    deleteTagsManySecret,
    findManyTagsById
  };
};
