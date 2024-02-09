import { Knex } from "knex";
import { validate as uuidValidate } from "uuid";

import { TDbClient } from "@app/db";
import { SecretsSchema, SecretType, TableName, TSecrets, TSecretsUpdate } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TSecretDALFactory = ReturnType<typeof secretDALFactory>;

export const secretDALFactory = (db: TDbClient) => {
  const secretOrm = ormify(db, TableName.Secret);

  const update = async (filter: Partial<TSecrets>, data: Omit<TSecretsUpdate, "version">, tx?: Knex) => {
    try {
      const sec = await (tx || db)(TableName.Secret).where(filter).update(data).increment("version", 1).returning("*");
      return sec;
    } catch (error) {
      throw new DatabaseError({ error, name: "update secret" });
    }
  };

  // the idea is to use postgres specific function
  // insert with id this will cause a conflict then merge the data
  const bulkUpdate = async (
    data: Array<{ filter: Partial<TSecrets>; data: TSecretsUpdate }>,

    tx?: Knex
  ) => {
    try {
      const secs = await Promise.all(
        data.map(async ({ filter, data: updateData }) => {
          const [doc] = await (tx || db)(TableName.Secret)
            .where(filter)
            .update(updateData)
            .increment("version", 1)
            .returning("*");
          if (!doc) throw new BadRequestError({ message: "Failed to update document" });
          return doc;
        })
      );
      return secs;
    } catch (error) {
      throw new DatabaseError({ error, name: "bulk update secret" });
    }
  };

  const bulkUpdateNoVersionIncrement = async (
    data: Array<{ filter: Partial<TSecrets>; data: TSecretsUpdate }>,
    tx?: Knex
  ) => {
    try {
      const secs = await Promise.all(
        data.map(async ({ filter, data: updateData }) => {
          const [doc] = await (tx || db)(TableName.Secret).where(filter).update(updateData).returning("*");
          if (!doc) throw new BadRequestError({ message: "Failed to update document" });
          return doc;
        })
      );
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
            void bd.orWhere({
              secretBlindIndex: el.blindIndex,
              type: el.type,
              ...(el.type === SecretType.Personal ? { userId } : {})
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
      // check if not uui then userId id is null (corner case because service token's ID is not UUI in effort to keep backwards compatibility from mongo)
      if (userId && !uuidValidate(userId)) {
        // eslint-disable-next-line
        userId = undefined;
      }

      const secs = await (tx || db)(TableName.Secret)
        .where({ folderId })
        .where((bd) => {
          void bd.whereNull("userId").orWhere({ userId: userId || null });
        })
        .leftJoin(TableName.JnSecretTag, `${TableName.Secret}.id`, `${TableName.JnSecretTag}.${TableName.Secret}Id`)
        .leftJoin(TableName.SecretTag, `${TableName.JnSecretTag}.${TableName.SecretTag}Id`, `${TableName.SecretTag}.id`)
        .select(selectAllTableCols(TableName.Secret))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .select(db.ref("name").withSchema(TableName.SecretTag).as("tagName"))
        .orderBy("id", "asc");
      const data = sqlNestRelationships({
        data: secs,
        key: "id",
        parentMapper: (el) => ({ _id: el.id, ...SecretsSchema.parse(el) }),
        childrenMapper: [
          {
            key: "tagId",
            label: "tags" as const,
            mapper: ({ tagId: id, tagColor: color, tagSlug: slug, tagName: name }) => ({
              id,
              color,
              slug,
              name
            })
          }
        ]
      });
      return data;
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
            if (el.type === SecretType.Personal && !userId) {
              throw new BadRequestError({ message: "Missing personal user id" });
            }
            void bd.orWhere({
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

  return {
    ...secretOrm,
    update,
    bulkUpdate,
    deleteMany,
    bulkUpdateNoVersionIncrement,
    findByFolderId,
    findByBlindIndexes
  };
};
