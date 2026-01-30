import { MongoAbility } from "@casl/ability";
import { Knex } from "knex";
import { validate as uuidValidate } from "uuid";

import { TDbClient } from "@app/db";
import { ProjectType, SecretsV2Schema, SecretType, TableName, TSecretsV2, TSecretsV2Update } from "@app/db/schemas";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { generateCacheKeyFromData } from "@app/lib/crypto/cache";
import { applyJitter } from "@app/lib/dates";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import {
  buildFindFilter,
  ormify,
  selectAllTableCols,
  sqlNestRelationships,
  TFindFilter,
  TFindOpt
} from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { SecretsOrderBy } from "@app/services/secret/secret-types";
import type {
  TFindSecretsByFolderIdsFilter,
  TGetSecretsDTO
} from "@app/services/secret-v2-bridge/secret-v2-bridge-types";

export const SecretServiceCacheKeys = {
  get productKey() {
    return `${ProjectType.SecretManager}`;
  },
  getSecretDalVersion: (projectId: string) => {
    return `${SecretServiceCacheKeys.productKey}:${projectId}:${TableName.SecretV2}-dal-version`;
  },
  getSecretsOfServiceLayer: (
    projectId: string,
    version: number,
    dto: TGetSecretsDTO & { permissionRules: MongoAbility["rules"] }
  ) => {
    return `${SecretServiceCacheKeys.productKey}:${projectId}:${
      TableName.SecretV2
    }-dal:v${version}:get-secrets-service-layer:${dto.actorId}-${generateCacheKeyFromData(dto)}`;
  }
};

export type TSecretV2BridgeDALFactory = ReturnType<typeof secretV2BridgeDALFactory>;
interface TSecretV2DalArg {
  db: TDbClient;
  keyStore: TKeyStoreFactory;
}

export const SECRET_DAL_TTL = () => applyJitter(10 * 60, 2 * 60);
export const SECRET_DAL_VERSION_TTL = "15m";
export const MAX_SECRET_CACHE_BYTES = 25 * 1024 * 1024;
export const secretV2BridgeDALFactory = ({ db, keyStore }: TSecretV2DalArg) => {
  const secretOrm = ormify(db, TableName.SecretV2);

  const invalidateSecretCacheByProjectId = async (projectId: string, tx?: Knex) => {
    const secretDalVersionKey = SecretServiceCacheKeys.getSecretDalVersion(projectId);
    await keyStore.pgIncrementBy(secretDalVersionKey, { incr: 1, tx, expiry: SECRET_DAL_VERSION_TTL });
  };

  const findOne = async (filter: Partial<TSecretsV2>, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretV2)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(filter, TableName.SecretV2))
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
        .leftJoin(
          TableName.SecretRotationV2SecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretRotationV2SecretMapping}.secretId`
        )
        .leftJoin(
          TableName.SecretReminderRecipients,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretReminderRecipients}.secretId`
        )
        .leftJoin(TableName.Users, `${TableName.SecretReminderRecipients}.userId`, `${TableName.Users}.id`)
        .select(selectAllTableCols(TableName.SecretV2))
        .select(db.ref("id").withSchema(TableName.SecretReminderRecipients).as("reminderRecipientId"))
        .select(db.ref("username").withSchema(TableName.Users).as("reminderRecipientUsername"))
        .select(db.ref("email").withSchema(TableName.Users).as("reminderRecipientEmail"))
        .select(db.ref("id").withSchema(TableName.Users).as("reminderRecipientUserId"))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .select(db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping));
      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          _id: el.id,
          ...SecretsV2Schema.parse(el),
          isRotatedSecret: Boolean(el.rotationId),
          rotationId: el.rotationId
        }),
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
          },
          {
            key: "reminderRecipientId",
            label: "secretReminderRecipients" as const,
            mapper: ({
              reminderRecipientId,
              reminderRecipientUsername,
              reminderRecipientEmail,
              reminderRecipientUserId
            }) => ({
              user: {
                id: reminderRecipientUserId,
                username: reminderRecipientUsername,
                email: reminderRecipientEmail
              },
              id: reminderRecipientId
            })
          }
        ]
      });
      return data?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.SecretV2}: FindOne` });
    }
  };

  const find = async (filter: TFindFilter<TSecretsV2 & { projectId?: string }>, opts: TFindOpt<TSecretsV2> = {}) => {
    const { offset, limit, sort, tx } = opts;
    try {
      const query = (tx || db.replicaNode())(TableName.SecretV2)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(filter))
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
        .leftJoin(TableName.ResourceMetadata, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
        .leftJoin(
          TableName.SecretRotationV2SecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretRotationV2SecretMapping}.secretId`
        )
        .leftJoin(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .leftJoin(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .select(
          db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
          db.ref("encryptedValue").withSchema(TableName.ResourceMetadata).as("metadataEncryptedValue"),
          db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue")
        )
        .select(selectAllTableCols(TableName.SecretV2))
        .select(db.ref("projectId").withSchema(TableName.Environment).as("environmentProjectId"))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .select(db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping));

      if (filter?.projectId) {
        void query.where(`${TableName.Environment}.projectId`, filter.projectId);
      }

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const docs = await query;
      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          _id: el.id,
          ...SecretsV2Schema.parse(el),
          rotationId: el.rotationId,
          isRotatedSecret: Boolean(el.rotationId),
          projectId: el.environmentProjectId
        }),
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
          },
          {
            key: "metadataId",
            label: "secretMetadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataEncryptedValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue,
              encryptedValue: metadataEncryptedValue
            })
          }
        ]
      });

      return data;
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.SecretV2}: Find` });
    }
  };

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
        throw new NotFoundError({ message: "One or more secrets was not found" });
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

  const findByFolderId = async (dto: { folderId: string; userId?: string; tx?: Knex }) => {
    try {
      const { folderId, tx } = dto;
      let { userId } = dto;
      // check if not uui then userId id is null (corner case because service token's ID is not UUI in effort to keep backwards compatibility from mongo
      if (userId && !uuidValidate(userId)) {
        // eslint-disable-next-line
        userId = undefined;
      }

      const secs = await (tx || db.replicaNode())(TableName.SecretV2)
        .where({ folderId })
        .where((bd) => {
          void bd
            .whereNull(`${TableName.SecretV2}.userId`)
            .orWhere({ [`${TableName.SecretV2}.userId` as "userId"]: userId || null });
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
        .leftJoin(TableName.ResourceMetadata, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
        .select(selectAllTableCols(TableName.SecretV2))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .select(
          db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue"),
          db.ref("encryptedValue").withSchema(TableName.ResourceMetadata).as("metadataEncryptedValue")
        )
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
          },
          {
            key: "metadataId",
            label: "secretMetadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataEncryptedValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue,
              encryptedValue: metadataEncryptedValue
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
      includeTagsInSearch?: boolean;
      includeMetadataInSearch?: boolean;
      excludeRotatedSecrets?: boolean;
    }
  ) => {
    try {
      // check if not uui then userId id is null (corner case because service token's ID is not UUI in effort to keep backwards compatibility from mongo)
      if (userId && !uuidValidate(userId)) {
        // eslint-disable-next-line no-param-reassign
        userId = undefined;
      }

      const query = (tx || db.replicaNode())(TableName.SecretV2)
        .leftJoin(
          TableName.SecretRotationV2SecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretRotationV2SecretMapping}.secretId`
        )
        .whereIn("folderId", folderIds)
        .where((bd) => {
          if (filters?.search) {
            void bd.whereILike(`${TableName.SecretV2}.key`, `%${filters?.search}%`);
            if (filters?.includeTagsInSearch) {
              void bd.orWhereILike(`${TableName.SecretTag}.slug`, `%${filters?.search}%`);
            }
            if (filters?.includeMetadataInSearch) {
              void bd
                .orWhereILike(`${TableName.ResourceMetadata}.key`, `%${filters?.search}%`)
                .orWhereILike(`${TableName.ResourceMetadata}.value`, `%${filters?.search}%`);
            }
          }
        })
        .where((bd) => {
          void bd.whereNull(`${TableName.SecretV2}.userId`);
          // scott: removing this as we don't need to count overrides
          // and there is currently a bug when you move secrets that doesn't move the override so this can skew count
          // .orWhere({ [`${TableName.SecretV2}.userId` as "userId"]: userId || null });
        })
        .countDistinct(`${TableName.SecretV2}.key`);

      // only need to join tags if filtering by tag slugs
      const slugs = filters?.tagSlugs?.filter(Boolean);
      if ((slugs && slugs.length > 0) || filters?.includeTagsInSearch) {
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
          );

        if (slugs?.length) {
          void query.whereIn("slug", slugs);
        }
      }

      if (filters?.includeMetadataInSearch) {
        void query.leftJoin(
          TableName.ResourceMetadata,
          `${TableName.SecretV2}.id`,
          `${TableName.ResourceMetadata}.secretId`
        );
      }

      if (filters?.excludeRotatedSecrets) {
        void query.whereNull(`${TableName.SecretRotationV2SecretMapping}.secretId`);
      }

      const secrets = await query;

      // @ts-expect-error not inferred by knex
      return Number(secrets[0]?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "get folder secret count" });
    }
  };

  // This method currently uses too many joins which is not performant, in case we need to add more filters we should consider refactoring this method
  const findByFolderIds = async (dto: {
    folderIds: string[];
    userId?: string;
    tx?: Knex;
    filters?: TFindSecretsByFolderIdsFilter;
  }) => {
    const { folderIds, tx, filters } = dto;
    let { userId } = dto;
    try {
      // check if not uui then userId id is null (corner case because service token's ID is not UUI in effort to keep backwards compatibility from mongo)
      if (userId && !uuidValidate(userId)) {
        // eslint-disable-next-line no-param-reassign
        userId = undefined;
      }

      const query = (tx || db.replicaNode())(TableName.SecretV2)
        .whereIn(`${TableName.SecretV2}.folderId`, folderIds)
        .where((bd) => {
          if (filters?.search) {
            void bd.whereILike(`${TableName.SecretV2}.key`, `%${filters?.search}%`);
            if (filters?.includeTagsInSearch) {
              void bd.orWhereILike(`${TableName.SecretTag}.slug`, `%${filters?.search}%`);
            }
            if (filters?.includeMetadataInSearch) {
              void bd
                .orWhereILike(`${TableName.ResourceMetadata}.key`, `%${filters?.search}%`)
                .orWhereILike(`${TableName.ResourceMetadata}.value`, `%${filters?.search}%`);
            }
          }

          if (filters?.keys) {
            void bd.whereIn(`${TableName.SecretV2}.key`, filters.keys);
          }
        })
        .where((bd) => {
          void bd
            .whereNull(`${TableName.SecretV2}.userId`)
            .orWhere({ [`${TableName.SecretV2}.userId` as "userId"]: userId || null });
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
        .leftJoin(TableName.ResourceMetadata, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
        .leftJoin(
          TableName.SecretRotationV2SecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretRotationV2SecretMapping}.secretId`
        )
        .leftJoin(TableName.Reminder, `${TableName.SecretV2}.id`, `${TableName.Reminder}.secretId`)
        .leftJoin(TableName.ReminderRecipient, `${TableName.Reminder}.id`, `${TableName.ReminderRecipient}.reminderId`)
        .leftJoin(TableName.Users, `${TableName.ReminderRecipient}.userId`, `${TableName.Users}.id`)
        .where((qb) => {
          if (filters?.metadataFilter && filters.metadataFilter.length > 0) {
            filters.metadataFilter.forEach((meta) => {
              void qb.whereExists((subQuery) => {
                void subQuery
                  .select("secretId")
                  .from(TableName.ResourceMetadata)
                  .whereRaw(`"${TableName.ResourceMetadata}"."secretId" = "${TableName.SecretV2}"."id"`)
                  .where(`${TableName.ResourceMetadata}.key`, meta.key)
                  .where(`${TableName.ResourceMetadata}.value`, meta.value)
                  .whereNotNull(`${TableName.ResourceMetadata}.value`);
              });
            });
          }
        })
        .select(
          selectAllTableCols(TableName.SecretV2),
          db.raw(
            `DENSE_RANK() OVER (ORDER BY "${TableName.SecretV2}".key ${
              filters?.orderDirection ?? OrderByDirection.ASC
            }) as rank`
          )
        )
        .select(db.ref("id").withSchema(TableName.Reminder).as("reminderId"))
        .select(db.ref("message").withSchema(TableName.Reminder).as("reminderNote"))
        .select(db.ref("repeatDays").withSchema(TableName.Reminder).as("reminderRepeatDays"))
        .select(db.ref("nextReminderDate").withSchema(TableName.Reminder).as("nextReminderDate"))
        .select(db.ref("id").withSchema(TableName.ReminderRecipient).as("reminderRecipientId"))
        .select(db.ref("username").withSchema(TableName.Users).as("reminderRecipientUsername"))
        .select(db.ref("email").withSchema(TableName.Users).as("reminderRecipientEmail"))
        .select(db.ref("id").withSchema(TableName.Users).as("reminderRecipientUserId"))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .select(
          db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue"),
          db.ref("encryptedValue").withSchema(TableName.ResourceMetadata).as("metadataEncryptedValue")
        )
        .select(db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping))
        .where((bd) => {
          const slugs = filters?.tagSlugs?.filter(Boolean);
          if (slugs && slugs.length > 0) {
            void bd.whereIn(`${TableName.SecretTag}.slug`, slugs);
          }
        })
        .where((bd) => {
          if (filters?.excludeRotatedSecrets) {
            void bd.whereNull(`${TableName.SecretRotationV2SecretMapping}.secretId`);
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
        parentMapper: (el) => ({
          _id: el.id,
          ...SecretsV2Schema.parse(el),
          rotationId: el.rotationId,
          isRotatedSecret: Boolean(el.rotationId)
        }),
        childrenMapper: [
          {
            key: "reminderRecipientId",
            label: "secretReminderRecipients" as const,
            mapper: ({
              reminderRecipientId,
              reminderRecipientUsername,
              reminderRecipientEmail,
              reminderRecipientUserId
            }) => ({
              user: {
                id: reminderRecipientUserId,
                username: reminderRecipientUsername,
                email: reminderRecipientEmail
              },
              id: reminderRecipientId
            })
          },
          {
            key: "tagId",
            label: "tags" as const,
            mapper: ({ tagId: id, tagColor: color, tagSlug: slug }) => ({
              id,
              color,
              slug,
              name: slug
            })
          },
          {
            key: "metadataId",
            label: "secretMetadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataId, metadataEncryptedValue }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue,
              encryptedValue: metadataEncryptedValue
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
              [`${TableName.SecretV2}.key` as "key"]: el.key,
              [`${TableName.SecretV2}.type` as "type"]: el.type,
              [`${TableName.SecretV2}.userId` as "userId"]: el.type === SecretType.Personal ? el.userId : null
            });
          });
        })
        .leftJoin(
          TableName.SecretRotationV2SecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretRotationV2SecretMapping}.secretId`
        )

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
        .leftJoin(TableName.ResourceMetadata, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .select(
          db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue"),
          db.ref("encryptedValue").withSchema(TableName.ResourceMetadata).as("metadataEncryptedValue")
        )
        .select(selectAllTableCols(TableName.SecretV2))
        .select(db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping));

      const docs = sqlNestRelationships({
        data: secrets,
        key: "id",
        parentMapper: (secret) => ({
          ...secret,
          isRotatedSecret: Boolean(secret.rotationId)
        }),
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
          },
          {
            key: "metadataId",
            label: "secretMetadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataId, metadataEncryptedValue }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue,
              encryptedValue: metadataEncryptedValue
            })
          }
        ]
      });

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "find by secret keys" });
    }
  };

  const updateSecretReferenceSecretKey = async (
    projectId: string,
    envSlug: string,
    secretPath: string,
    oldSecretKey: string,
    newSecretKey: string,
    tx?: Knex
  ) => {
    try {
      const updatedCount = await (tx || db)(TableName.SecretReferenceV2)
        .whereIn("secretId", (qb) => {
          void qb
            .select(`${TableName.SecretV2}.id`)
            .from(TableName.SecretV2)
            .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
            .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
            .where(`${TableName.Environment}.projectId`, projectId);
        })
        .where({
          environment: envSlug,
          secretPath,
          secretKey: oldSecretKey
        })
        .update({ secretKey: newSecretKey });

      return updatedCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpdateSecretReferenceSecretKey" });
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

  const findReferencedSecretReferencesBySecretKey = async (
    projectId: string,
    envSlug: string,
    secretPath: string,
    secretKey: string,
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretReferenceV2)
        .where({
          secretPath,
          environment: envSlug,
          secretKey
        })
        .join(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.SecretReferenceV2}.secretId`)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where("projectId", projectId)
        .select(selectAllTableCols(TableName.SecretReferenceV2))
        .select("folderId");

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindReferencedSecretReferencesBySecretKey" });
    }
  };

  const updateSecretReferenceEnvAndPath = async (
    projectId: string,
    oldEnvSlug: string,
    oldSecretPath: string,
    secretKey: string,
    newEnvSlug: string,
    newSecretPath: string,
    tx?: Knex
  ) => {
    try {
      const updatedCount = await (tx || db)(TableName.SecretReferenceV2)
        .whereIn("secretId", (qb) => {
          void qb
            .select(`${TableName.SecretV2}.id`)
            .from(TableName.SecretV2)
            .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
            .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
            .where(`${TableName.Environment}.projectId`, projectId);
        })
        .where({
          environment: oldEnvSlug,
          secretPath: oldSecretPath,
          secretKey
        })
        .update({ environment: newEnvSlug, secretPath: newSecretPath });

      return updatedCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpdateSecretReferenceEnvAndPath" });
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

        .leftJoin(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .leftJoin(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .leftJoin(TableName.ResourceMetadata, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
        .select(selectAllTableCols(TableName.SecretV2))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .select(
          db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue"),
          db.ref("encryptedValue").withSchema(TableName.ResourceMetadata).as("metadataEncryptedValue")
        )
        .select(db.ref("projectId").withSchema(TableName.Environment).as("projectId"));

      const docs = sqlNestRelationships({
        data: rawDocs,
        key: "id",
        parentMapper: (el) => ({ _id: el.id, projectId: el.projectId, ...SecretsV2Schema.parse(el) }),
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
          },
          {
            key: "metadataId",
            label: "secretMetadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataEncryptedValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue,
              encryptedValue: metadataEncryptedValue
            })
          }
        ]
      });
      return docs?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindOneWIthTags" });
    }
  };

  const findSecretsWithReminderRecipients = async (ids: string[], limit: number, tx?: Knex) => {
    try {
      // Create a subquery to get limited secret IDs
      const limitedSecretIds = (tx || db.replicaNode())(TableName.SecretV2)
        .whereIn(`${TableName.SecretV2}.id`, ids)
        .limit(limit)
        .select("id");

      // Join with all recipients for the limited secrets
      const docs = await (tx || db.replicaNode())(TableName.SecretV2)
        .whereIn(`${TableName.SecretV2}.id`, limitedSecretIds)
        .leftJoin(TableName.Reminder, `${TableName.SecretV2}.id`, `${TableName.Reminder}.secretId`)
        .leftJoin(TableName.ReminderRecipient, `${TableName.Reminder}.id`, `${TableName.ReminderRecipient}.reminderId`)
        .select(selectAllTableCols(TableName.SecretV2))
        .select(db.ref("userId").withSchema(TableName.ReminderRecipient).as("reminderRecipientUserId"));

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          _id: el.id,
          ...SecretsV2Schema.parse(el)
        }),
        childrenMapper: [
          {
            key: "reminderRecipientUserId",
            label: "recipients" as const,
            mapper: ({ reminderRecipientUserId }) => reminderRecipientUserId
          }
        ]
      });

      return data;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretsWithReminderRecipients" });
    }
  };

  const findSecretsWithReminderRecipientsOld = async (ids: string[], limit: number, tx?: Knex) => {
    try {
      // Create a subquery to get limited secret IDs
      const limitedSecretIds = (tx || db.replicaNode())(TableName.SecretV2)
        .whereIn(`${TableName.SecretV2}.id`, ids)
        .limit(limit)
        .select("id");

      // Join with all recipients for the limited secrets
      const docs = await (tx || db.replicaNode())(TableName.SecretV2)
        .whereIn(`${TableName.SecretV2}.id`, limitedSecretIds)
        .leftJoin(TableName.Reminder, `${TableName.SecretV2}.id`, `${TableName.Reminder}.secretId`)
        .leftJoin(
          TableName.SecretReminderRecipients,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretReminderRecipients}.secretId`
        )
        .select(selectAllTableCols(TableName.SecretV2))
        .select(db.ref("userId").withSchema(TableName.SecretReminderRecipients).as("reminderRecipientUserId"));

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          _id: el.id,
          ...SecretsV2Schema.parse(el)
        }),
        childrenMapper: [
          {
            key: "reminderRecipientUserId",
            label: "recipients" as const,
            mapper: ({ reminderRecipientUserId }) => reminderRecipientUserId
          }
        ]
      });

      return data;
    } catch (error) {
      throw new DatabaseError({ error, name: "findSecretsWithReminderRecipientsOld" });
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
    countByFolderIds,
    findOne,
    find,
    invalidateSecretCacheByProjectId,
    findSecretsWithReminderRecipients,
    findSecretsWithReminderRecipientsOld,
    findReferencedSecretReferencesBySecretKey,
    updateSecretReferenceSecretKey,
    updateSecretReferenceEnvAndPath
  };
};
