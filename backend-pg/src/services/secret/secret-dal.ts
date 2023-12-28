import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { SecretType, TableName, TSecrets, TSecretsInsert, TSecretsUpdate } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { mergeOneToManyRelation, ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretDalFactory = ReturnType<typeof secretDalFactory>;

export const secretDalFactory = (db: TDbClient) => {
  const secretOrm = ormify(db, TableName.Secret);

  const update = async (
    filter: Partial<TSecrets>,
    data: Omit<TSecretsUpdate, "version">,
    tx?: Knex
  ) => {
    try {
      const sec = await (tx || db)(TableName.Secret)
        .where(filter)
        .update(data)
        .increment("version", 1)
        .returning("*");
      return sec;
    } catch (error) {
      throw new DatabaseError({ error, name: "update secret" });
    }
  };

  // the idea is to use postgres specific function
  // insert with id this will cause a conflict then merge the data
  const bulkUpdate = async (data: Array<TSecretsUpdate & { id: string }>, tx?: Knex) => {
    try {
      const secs = await (tx || db)(TableName.Secret)
        .insert(data as TSecretsInsert[])
        .increment("version", 1)
        .onConflict("id")
        .merge()
        .returning("*");
      return secs;
    } catch (error) {
      throw new DatabaseError({ error, name: "bulk update secret" });
    }
  };

  const deleteMany = async (
    data: Array<{ blindIndex: string; type: SecretType }>,
    folderId: string,
    userId: string,
    tx?: Knex
  ) => {
    try {
      const deletedSecrets = await (tx || db)(TableName.Secret)
        .where({ folderId })
        .where((bd) => {
          data.forEach((el) => {
            bd.orWhere({
              secretBlindIndex: el.blindIndex,
              type: el.type,
              userId: el.type === SecretType.Personal ? userId : null
            });
          });
        })
        .delete()
        .returning("*");
      return deletedSecrets;
    } catch (error) {
      throw new DatabaseError({ error, name: "delete many secret" });
    }
  };

  const findByFolderId = async (folderId: string, userId?: string, tx?: Knex) => {
    try {
      const secs = await (tx || db)(TableName.Secret)
        .where({ folderId })
        .where((bd) => {
          bd.whereNull("userId").orWhere({ userId: userId || null });
        })
        .join(
          TableName.JnSecretTag,
          `${TableName.Secret}.id`,
          `${TableName.JnSecretTag}.${TableName.Secret}Id`
        )
        .join(
          TableName.SecretTag,
          `${TableName.JnSecretTag}.${TableName.SecretTag}Id`,
          `${TableName.SecretTag}.id`
        )
        .select(selectAllTableCols(TableName.Secret))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .select(db.ref("name").withSchema(TableName.SecretTag).as("tagName"));
      const formatedSecs = mergeOneToManyRelation(
        secs,
        "id",
        ({ tagColor, tagId, tagName, tagSlug, ...data }) => data,
        ({ tagSlug: slug, tagName: name, tagId: id, tagColor: color }) => ({
          id,
          slug,
          name,
          color
        }),
        "tags"
      );
      return formatedSecs;
    } catch (error) {
      throw new DatabaseError({ error, name: "get all secret" });
    }
  };

  const findByBlindIndexes = async (
    folderId: string,
    blindIndexes: Array<{ blindIndex: string; type: SecretType }>,
    userId?: string,
    tx?: Knex
  ) => {
    if (!blindIndexes.length) return [];
    try {
      const secrets = await (tx || db)(TableName.Secret)
        .where({ folderId })
        .where((bd) => {
          blindIndexes.forEach((el) => {
            bd.orWhere({
              secretBlindIndex: el.blindIndex,
              type: el.type,
              userId: el.type === SecretType.Personal ? userId : null
            });
          });
        });
      return secrets;
    } catch (error) {
      throw new DatabaseError({ error, name: "find by blind indexes" });
    }
  };

  return { ...secretOrm, update, bulkUpdate, deleteMany, findByFolderId, findByBlindIndexes };
};
