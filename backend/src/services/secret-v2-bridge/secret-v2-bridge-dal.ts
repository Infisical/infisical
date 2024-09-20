import { Knex } from "knex";
import { validate as uuidValidate } from "uuid";

import { TDbClient } from "@app/db";
import { SecretsV2Schema, SecretType, TableName, TSecretsV2, TSecretsV2Update } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { SecretsOrderBy } from "@app/services/secret/secret-types";

export type TSecretV2BridgeDALFactory = ReturnType<typeof secretV2BridgeDALFactory>;

export const secretV2BridgeDALFactory = (db: TDbClient) => {
  const secretOrm = ormify(db, TableName.SecretV2);

  const update = async (filter: Partial<TSecretsV2>, data: Omit<TSecretsV2Update, "version">, tx?: Knex) => {
    try {
      const sec = await (tx || db)(TableName.SecretV2)
        .where(filter)
        .update(data)
        .increment("version", 1)
        .returning("*");
      return sec;
    } catch (error) {
      throw new DatabaseError({ error, name: "update secret" });
    }
  };

  const bulkUpdate = async (
    data: Array<{ filter: Partial<TSecretsV2>; data: TSecretsV2Update }>,

    tx?: Knex
  ) => {
    try {
      const secs = await Promise.all(
        data.map(async ({ filter, data: updateData }) => {
          const [doc] = await (tx || db)(TableName.SecretV2)
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

  const bulkUpdateNoVersionIncrement = async (data: TSecretsV2[], tx?: Knex) => {
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
        throw new BadRequestError({ message: "Some of the secrets do not exist" });
      }

      if (data.length === 0) return [];

      const updatedSecrets = await (tx || db)(TableName.SecretV2)
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
    data: Array<{ key: string; type: SecretType }>,
    folderId: string,
    userId: string,
    tx?: Knex
  ) => {
    try {
      const deletedSecrets = await (tx || db)(TableName.SecretV2)
        .where({ folderId })
        .where((bd) => {
          data.forEach((el) => {
            void bd.orWhere({
              key: el.key,
              type: el.type,
              ...(el.type === SecretType.Personal ? { userId } : {})
            });
            // if shared is getting deleted then personal ones also should be deleted
            if (el.type === SecretType.Shared) {
              void bd.orWhere({
                key: el.key,
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

      const secs = await (tx || db.replicaNode())(TableName.SecretV2)
        .where({ folderId })
        .where((bd) => {
          void bd.whereNull("userId").orWhere({ userId: userId || null });
        })
        .leftJoin(
          TableName.SecretV2JnTag,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretV2JnTag}.${TableName.SecretV2}Id`
        )
        .leftJoin(
          TableName.SecretTag,
          `${TableName.SecretV2JnTag}.${TableName.SecretTag}Id`,
          `${TableName.SecretTag}.id`
        )
        .select(selectAllTableCols(TableName.SecretV2))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .orderBy("id", "asc");

      const data = sqlNestRelationships({
        data: secs,
        key: "id",
        parentMapper: (el) => ({ _id: el.id, ...SecretsV2Schema.parse(el) }),
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
      const tags = await (tx || db.replicaNode())(TableName.SecretV2JnTag)
        .join(TableName.SecretTag, `${TableName.SecretV2JnTag}.${TableName.SecretTag}Id`, `${TableName.SecretTag}.id`)
        .where({ [`${TableName.SecretV2}Id` as const]: secretId })
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

  // get unique secret count by folder IDs
  const countByFolderIds = async (
    folderIds: string[],
    userId?: string,
    tx?: Knex,
    filters?: {
      search?: string;
      tagSlugs?: string[];
    }
  ) => {
    try {
      // check if not uui then userId id is null (corner case because service token's ID is not UUI in effort to keep backwards compatibility from mongo)
      if (userId && !uuidValidate(userId)) {
        // eslint-disable-next-line no-param-reassign
        userId = undefined;
      }

      const query = (tx || db.replicaNode())(TableName.SecretV2)
        .whereIn("folderId", folderIds)
        .where((bd) => {
          if (filters?.search) {
            void bd.whereILike("key", `%${filters?.search}%`);
          }
        })
        .where((bd) => {
          void bd.whereNull("userId").orWhere({ userId: userId || null });
        })
        .countDistinct("key");

      // only need to join tags if filtering by tag slugs
      const slugs = filters?.tagSlugs?.filter(Boolean);
      if (slugs && slugs.length > 0) {
        void query
          .leftJoin(
            TableName.SecretV2JnTag,
            `${TableName.SecretV2}.id`,
            `${TableName.SecretV2JnTag}.${TableName.SecretV2}Id`
          )
          .leftJoin(
            TableName.SecretTag,
            `${TableName.SecretV2JnTag}.${TableName.SecretTag}Id`,
            `${TableName.SecretTag}.id`
          )
          .whereIn("slug", slugs);
      }

      const secrets = await query;

      return Number(secrets[0]?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "get folder secret count" });
    }
  };

  const findByFolderIds = async (
    folderIds: string[],
    userId?: string,
    tx?: Knex,
    filters?: {
      limit?: number;
      offset?: number;
      orderBy?: SecretsOrderBy;
      orderDirection?: OrderByDirection;
      search?: string;
      tagSlugs?: string[];
    }
  ) => {
    try {
      // check if not uui then userId id is null (corner case because service token's ID is not UUI in effort to keep backwards compatibility from mongo)
      if (userId && !uuidValidate(userId)) {
        // eslint-disable-next-line no-param-reassign
        userId = undefined;
      }

      const query = (tx || db.replicaNode())(TableName.SecretV2)
        .whereIn("folderId", folderIds)
        .where((bd) => {
          if (filters?.search) {
            void bd.whereILike("key", `%${filters?.search}%`);
          }
        })
        .where((bd) => {
          void bd.whereNull("userId").orWhere({ userId: userId || null });
        })
        .leftJoin(
          TableName.SecretV2JnTag,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretV2JnTag}.${TableName.SecretV2}Id`
        )
        .leftJoin(
          TableName.SecretTag,
          `${TableName.SecretV2JnTag}.${TableName.SecretTag}Id`,
          `${TableName.SecretTag}.id`
        )
        .select(
          selectAllTableCols(TableName.SecretV2),
          db.raw(`DENSE_RANK() OVER (ORDER BY "key" ${filters?.orderDirection ?? OrderByDirection.ASC}) as rank`)
        )
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .where((bd) => {
          const slugs = filters?.tagSlugs?.filter(Boolean);
          if (slugs && slugs.length > 0) {
            void bd.whereIn("slug", slugs);
          }
        })
        .orderBy(
          filters?.orderBy === SecretsOrderBy.Name ? "key" : "id",
          filters?.orderDirection ?? OrderByDirection.ASC
        );

      let secs: Awaited<typeof query>;

      if (filters?.limit) {
        const rankOffset = (filters?.offset ?? 0) + 1; // ranks start at 1
        secs = await (tx || db)
          .with("w", query)
          .select("*")
          .from<Awaited<typeof query>[number]>("w")
          .where("w.rank", ">=", rankOffset)
          .andWhere("w.rank", "<", rankOffset + filters.limit);
      } else {
        secs = await query;
      }

      const data = sqlNestRelationships({
        data: secs,
        key: "id",
        parentMapper: (el) => ({ _id: el.id, ...SecretsV2Schema.parse(el) }),
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

  const findBySecretKeys = async (
    folderId: string,
    query: Array<{ key: string; type: SecretType.Shared } | { key: string; type: SecretType.Personal; userId: string }>,
    tx?: Knex
  ) => {
    if (!query.length) return [];
    try {
      const secrets = await (tx || db.replicaNode())(TableName.SecretV2)
        .where({ folderId })
        .where((bd) => {
          query.forEach((el) => {
            if (el.type === SecretType.Personal && !el.userId) {
              throw new BadRequestError({ message: "Missing personal user id" });
            }
            void bd.orWhere({
              key: el.key,
              type: el.type,
              userId: el.type === SecretType.Personal ? el.userId : null
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
      references: Array<{ environment: string; secretPath: string; secretKey: string }>;
    }[] = [],
    tx?: Knex
  ) => {
    try {
      if (!data.length) return;

      await (tx || db)(TableName.SecretReferenceV2)
        .whereIn(
          "secretId",
          data.map(({ secretId }) => secretId)
        )
        .delete();
      const newSecretReferences = data
        .filter(({ references }) => references.length)
        .flatMap(({ secretId, references }) =>
          references.map(({ environment, secretPath, secretKey }) => ({
            secretPath,
            secretId,
            environment,
            secretKey
          }))
        );
      if (!newSecretReferences.length) return;
      const secretReferences = await (tx || db).batchInsert(TableName.SecretReferenceV2, newSecretReferences);
      return secretReferences;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpsertSecretReference" });
    }
  };

  const findReferencedSecretReferences = async (projectId: string, envSlug: string, secretPath: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretReferenceV2)
        .where({
          secretPath,
          environment: envSlug
        })
        .join(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.SecretReferenceV2}.secretId`)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where("projectId", projectId)
        .select(selectAllTableCols(TableName.SecretReferenceV2))
        .select("folderId");

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindReferencedSecretReferences" });
    }
  };

  // special query to backfill secret value
  const findAllProjectSecretValues = async (projectId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretV2)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where("projectId", projectId)
        // not empty
        .whereNotNull("encryptedValue")
        .select("encryptedValue", `${TableName.SecretV2}.id` as "id");
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindAllProjectSecretValues" });
    }
  };

  const findOneWithTags = async (filter: Partial<TSecretsV2>, tx?: Knex) => {
    try {
      const rawDocs = await (tx || db.replicaNode())(TableName.SecretV2)
        .where(filter)
        .leftJoin(
          TableName.SecretV2JnTag,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretV2JnTag}.${TableName.SecretV2}Id`
        )
        .leftJoin(
          TableName.SecretTag,
          `${TableName.SecretV2JnTag}.${TableName.SecretTag}Id`,
          `${TableName.SecretTag}.id`
        )
        .select(selectAllTableCols(TableName.SecretV2))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"));
      const docs = sqlNestRelationships({
        data: rawDocs,
        key: "id",
        parentMapper: (el) => ({ _id: el.id, ...SecretsV2Schema.parse(el) }),
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
    findBySecretKeys,
    upsertSecretReferences,
    findReferencedSecretReferences,
    findAllProjectSecretValues,
    countByFolderIds
  };
};
