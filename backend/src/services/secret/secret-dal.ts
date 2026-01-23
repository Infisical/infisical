import { Knex } from "knex";
import { validate as uuidValidate } from "uuid";

import { TDbClient } from "@app/db";
import { SecretType, TableName } from "@app/db/schemas/models";
import { SecretsSchema, TSecrets, TSecretsUpdate } from "@app/db/schemas/secrets";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
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

  const bulkUpdateNoVersionIncrement = async (data: TSecrets[], tx?: Knex) => {
    try {
      const existingSecrets = await secretOrm.find(
        {
          $in: {
            id: data.map((el) => el.id)
          }
        },
        { tx }
      );

      if (existingSecrets.length !== data.length) {
        throw new NotFoundError({ message: "Some of the secrets do not exist" });
      }

      if (data.length === 0) return [];

      const updatedSecrets = await (tx || db)(TableName.Secret)
        .insert(data)
        .onConflict("id") // this will cause a conflict then merge the data
        .merge() // Merge the data with the existing data
        .returning("*");

      return updatedSecrets;
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
            if (el.type === SecretType.Shared) {
              void bd.orWhere({
                secretBlindIndex: el.blindIndex,
                type: SecretType.Personal
              });
            }
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

      const secs = await (tx || db.replicaNode())(TableName.Secret)
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
        .orderBy("id", "asc");
      const data = sqlNestRelationships({
        data: secs,
        key: "id",
        parentMapper: (el) => ({ _id: el.id, ...SecretsSchema.parse(el) }),
        childrenMapper: [
          {
            key: "tagId",
            label: "tags" as const,
            mapper: ({ tagId: id, tagColor: color, tagSlug: slug }) => ({
              id,
              color,
              slug,
              name: slug
            })
          }
        ]
      });
      return data;
    } catch (error) {
      throw new DatabaseError({ error, name: "get all secret" });
    }
  };

  const getSecretTags = async (secretId: string, tx?: Knex) => {
    try {
      const tags = await (tx || db.replicaNode())(TableName.JnSecretTag)
        .join(TableName.SecretTag, `${TableName.JnSecretTag}.${TableName.SecretTag}Id`, `${TableName.SecretTag}.id`)
        .where({ [`${TableName.Secret}Id` as const]: secretId })
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"));

      return tags.map((el) => ({
        id: el.tagId,
        color: el.tagColor,
        slug: el.tagSlug,
        name: el.tagSlug
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "get secret tags" });
    }
  };

  const findManySecretsWithTags = async (
    filter: {
      secretIds: string[];
      type: SecretType;
    },
    tx?: Knex
  ) => {
    try {
      const secrets = await (tx || db.replicaNode())(TableName.Secret)
        .whereIn(`${TableName.Secret}.id` as "id", filter.secretIds)
        .where("type", filter.type)
        .leftJoin(TableName.JnSecretTag, `${TableName.Secret}.id`, `${TableName.JnSecretTag}.${TableName.Secret}Id`)
        .leftJoin(TableName.SecretTag, `${TableName.JnSecretTag}.${TableName.SecretTag}Id`, `${TableName.SecretTag}.id`)
        .select(selectAllTableCols(TableName.Secret))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"));

      const data = sqlNestRelationships({
        data: secrets,
        key: "id",
        parentMapper: (el) => ({ _id: el.id, ...SecretsSchema.parse(el) }),
        childrenMapper: [
          {
            key: "tagId",
            label: "tags" as const,
            mapper: ({ tagId: id, tagColor: color, tagSlug: slug }) => ({
              id,
              color,
              slug,
              name: slug
            })
          }
        ]
      });

      return data;
    } catch (error) {
      throw new DatabaseError({ error, name: "get many secrets with tags" });
    }
  };

  const findByFolderIds = async (folderIds: string[], userId?: string, tx?: Knex) => {
    try {
      // check if not uui then userId id is null (corner case because service token's ID is not UUI in effort to keep backwards compatibility from mongo)
      if (userId && !uuidValidate(userId)) {
        // eslint-disable-next-line no-param-reassign
        userId = undefined;
      }

      const secs = await (tx || db.replicaNode())(TableName.Secret)
        .whereIn("folderId", folderIds)
        .where((bd) => {
          void bd.whereNull("userId").orWhere({ userId: userId || null });
        })
        .leftJoin(TableName.JnSecretTag, `${TableName.Secret}.id`, `${TableName.JnSecretTag}.${TableName.Secret}Id`)
        .leftJoin(TableName.SecretTag, `${TableName.JnSecretTag}.${TableName.SecretTag}Id`, `${TableName.SecretTag}.id`)
        .select(selectAllTableCols(TableName.Secret))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .orderBy("id", "asc");
      const data = sqlNestRelationships({
        data: secs,
        key: "id",
        parentMapper: (el) => ({ _id: el.id, ...SecretsSchema.parse(el) }),
        childrenMapper: [
          {
            key: "tagId",
            label: "tags" as const,
            mapper: ({ tagId: id, tagColor: color, tagSlug: slug }) => ({
              id,
              color,
              slug,
              name: slug
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
      const secrets = await (tx || db.replicaNode())(TableName.Secret)
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

  const upsertSecretReferences = async (
    data: {
      secretId: string;
      references: Array<{ environment: string; secretPath: string }>;
    }[] = [],
    tx?: Knex
  ) => {
    try {
      if (!data.length) return;

      await (tx || db)(TableName.SecretReference)
        .whereIn(
          "secretId",
          data.map(({ secretId }) => secretId)
        )
        .delete();
      const newSecretReferences = data
        .filter(({ references }) => references.length)
        .flatMap(({ secretId, references }) =>
          references.map(({ environment, secretPath }) => ({
            secretPath,
            secretId,
            environment
          }))
        );
      if (!newSecretReferences.length) return;
      const secretReferences = await (tx || db)(TableName.SecretReference).insert(newSecretReferences);
      return secretReferences;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpsertSecretReference" });
    }
  };

  const findReferencedSecretReferences = async (projectId: string, envSlug: string, secretPath: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretReference)
        .where({
          secretPath,
          environment: envSlug
        })
        .join(TableName.Secret, `${TableName.Secret}.id`, `${TableName.SecretReference}.secretId`)
        .join(TableName.SecretFolder, `${TableName.Secret}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where("projectId", projectId)
        .select(selectAllTableCols(TableName.SecretReference))
        .select("folderId");
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindReferencedSecretReferences" });
    }
  };

  // special query to backfill secret value
  const findAllProjectSecretValues = async (projectId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Secret)
        .join(TableName.SecretFolder, `${TableName.Secret}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where("projectId", projectId)
        // not empty
        .whereNotNull("secretValueCiphertext")
        .select("secretValueTag", "secretValueCiphertext", "secretValueIV", `${TableName.Secret}.id` as "id");
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindAllProjectSecretValues" });
    }
  };

  const findOneWithTags = async (filter: Partial<TSecrets>, tx?: Knex) => {
    try {
      const rawDocs = await (tx || db.replicaNode())(TableName.Secret)
        .where(filter)
        .leftJoin(TableName.JnSecretTag, `${TableName.Secret}.id`, `${TableName.JnSecretTag}.${TableName.Secret}Id`)
        .leftJoin(TableName.SecretTag, `${TableName.JnSecretTag}.${TableName.SecretTag}Id`, `${TableName.SecretTag}.id`)
        .select(selectAllTableCols(TableName.Secret))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"));
      const docs = sqlNestRelationships({
        data: rawDocs,
        key: "id",
        parentMapper: (el) => ({ _id: el.id, ...SecretsSchema.parse(el) }),
        childrenMapper: [
          {
            key: "tagId",
            label: "tags" as const,
            mapper: ({ tagId: id, tagColor: color, tagSlug: slug }) => ({
              id,
              color,
              slug,
              name: slug
            })
          }
        ]
      });
      return docs?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindOneWIthTags" });
    }
  };

  return {
    ...secretOrm,
    update,
    bulkUpdate,
    deleteMany,
    bulkUpdateNoVersionIncrement,
    getSecretTags,
    findOneWithTags,
    findByFolderId,
    findByFolderIds,
    findByBlindIndexes,
    upsertSecretReferences,
    findReferencedSecretReferences,
    findAllProjectSecretValues,
    findManySecretsWithTags
  };
};
