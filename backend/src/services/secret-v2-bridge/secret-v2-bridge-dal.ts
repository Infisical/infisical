import { Knex } from "knex";
import { validate as uuidValidate } from "uuid";

import { TDbClient } from "@app/db";
import { ProjectType, SecretsV2Schema, SecretType, TableName, TSecretsV2, TSecretsV2Update } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { applyJitter, utcDayStamp } from "@app/lib/dates";
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
import type { TFindSecretsByFolderIdsFilter } from "@app/services/secret-v2-bridge/secret-v2-bridge-types";

export const SecretServiceCacheKeys = {
  get productKey() {
    return `${ProjectType.SecretManager}`;
  },
  getSecretDalVersion: (projectId: string) => {
    return `${SecretServiceCacheKeys.productKey}:${projectId}:${TableName.SecretV2}-dal-version`;
  },
  getSecretsOfServiceLayer: (arg: {
    projectId: string;
    version: number;
    actorId: string;
    permissionFingerprint: string;
    permissionHash: string;
    requestParamsHash: string;
  }) => {
    const { projectId, version, actorId, permissionFingerprint, permissionHash, requestParamsHash } = arg;
    return `${SecretServiceCacheKeys.productKey}:${projectId}:${TableName.SecretV2}-dal:v${version}:get-secrets-service-layer:${actorId}-${permissionFingerprint}-${permissionHash}-${requestParamsHash}`;
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
    await keyStore.deleteItem(KeyStorePrefixes.SecretEtag(projectId, utcDayStamp()));

    // When a source project's secrets change, target projects that consume them
    // via cross-project grants must also be invalidated so they don't serve
    // stale source values from cache.
    const targetGrants = await (tx || db.replicaNode())(TableName.ProjectFolderGrant)
      .where("sourceProjectId", projectId)
      .select("targetProjectId")
      .groupBy("targetProjectId");

    const stamp = utcDayStamp();
    await Promise.all(
      targetGrants.map(async ({ targetProjectId }) => {
        const targetVersionKey = SecretServiceCacheKeys.getSecretDalVersion(targetProjectId);
        await keyStore.pgIncrementBy(targetVersionKey, { incr: 1, tx, expiry: SECRET_DAL_VERSION_TTL });
        await keyStore.deleteItem(KeyStorePrefixes.SecretEtag(targetProjectId, stamp));
      })
    );
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
          TableName.HoneyTokenSecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.HoneyTokenSecretMapping}.secretId`
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
        .select(db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping))
        .select(db.ref("honeyTokenId").withSchema(TableName.HoneyTokenSecretMapping).as("honeyTokenId"));
      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          _id: el.id,
          ...SecretsV2Schema.parse(el),
          isHoneyTokenSecret: Boolean(el.honeyTokenId),
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
        .leftJoin(
          TableName.HoneyTokenSecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.HoneyTokenSecretMapping}.secretId`
        )
        .leftJoin(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .leftJoin(TableName.Environment, function joinActiveEnvForFolder() {
          this.on(`${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
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
        .select(db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping))
        .select(db.ref("honeyTokenId").withSchema(TableName.HoneyTokenSecretMapping).as("honeyTokenId"));

      if (filter?.projectId) {
        void query.where(`${TableName.Environment}.projectId`, filter.projectId);
      }

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }
      // Secondary ordering for deterministic metadata/tag order with LEFT JOINs (matches findByFolderIds)
      void query
        .orderBy(`${TableName.ResourceMetadata}.createdAt`, "asc", "first")
        .orderBy(`${TableName.ResourceMetadata}.id`, "asc", "first")
        .orderBy(`${TableName.SecretTag}.createdAt`, "asc", "first")
        .orderBy(`${TableName.SecretTag}.id`, "asc", "first");

      const docs = await query;
      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          _id: el.id,
          ...SecretsV2Schema.parse(el),
          isHoneyTokenSecret: Boolean(el.honeyTokenId),
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
      const secs: TSecretsV2[] = [];

      for await (const { filter, data: updateData } of data) {
        const [doc] = await (tx || db)(TableName.SecretV2)
          .where(filter)
          .update(updateData)
          .increment("version", 1)
          .returning("*");
        if (!doc) throw new BadRequestError({ message: "Failed to update document" });
        secs.push(doc);
      }

      return secs;
    } catch (error) {
      throw new DatabaseError({ error, name: "bulk update secret" });
    }
  };

  const bulkUpdateById = async (
    data: Array<{ filter: Pick<TSecretsV2, "id"> & Partial<TSecretsV2>; data: TSecretsV2Update }>,
    tx?: Knex
  ) => {
    try {
      if (data.length === 0) return [];

      const ids = data.map(({ filter }) => filter.id);

      const existingSecrets = await (tx || db)(TableName.SecretV2).whereIn("id", ids).select("*");

      const existingById = new Map(existingSecrets.map((s) => [s.id, s]));

      const rowsToUpsert = data.map(({ filter, data: updateData }) => {
        const existing = existingById.get(filter.id);
        if (!existing) throw new BadRequestError({ message: "Failed to update document" });

        return {
          ...existing,
          ...updateData,
          version: existing.version + 1
        };
      });

      const updatedSecrets = await (tx || db)(TableName.SecretV2)
        .insert(rowsToUpsert)
        .onConflict("id")
        .merge()
        .returning("*");

      if (updatedSecrets.length !== data.length) {
        throw new BadRequestError({ message: "Failed to update some documents" });
      }

      return updatedSecrets;
    } catch (error) {
      throw new DatabaseError({ error, name: "bulk update secret by id" });
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
        // Order by key (name) to match Go sidecar; secondary order by createdAt+id for deterministic tag/metadata order
        .orderBy(`${TableName.SecretV2}.key`, "asc")
        .orderBy(`${TableName.ResourceMetadata}.createdAt`, "asc", "first")
        .orderBy(`${TableName.ResourceMetadata}.id`, "asc", "first")
        .orderBy(`${TableName.SecretTag}.createdAt`, "asc", "first")
        .orderBy(`${TableName.SecretTag}.id`, "asc", "first");

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
        .leftJoin(
          TableName.HoneyTokenSecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.HoneyTokenSecretMapping}.secretId`
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
        .leftJoin(
          TableName.HoneyTokenSecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.HoneyTokenSecretMapping}.secretId`
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
        .select(db.ref("honeyTokenId").withSchema(TableName.HoneyTokenSecretMapping).as("honeyTokenId"))
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
        // Always order by key (name) to match the Go sidecar's ordering.
        // Secondary order by createdAt+id for deterministic tag/metadata order with LEFT JOINs.
        .orderBy("key", filters?.orderDirection ?? OrderByDirection.ASC)
        .orderBy(`${TableName.ResourceMetadata}.createdAt`, "asc", "first")
        .orderBy(`${TableName.ResourceMetadata}.id`, "asc", "first")
        .orderBy(`${TableName.SecretTag}.createdAt`, "asc", "first")
        .orderBy(`${TableName.SecretTag}.id`, "asc", "first");

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
          isHoneyTokenSecret: Boolean(el.honeyTokenId),
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
          TableName.HoneyTokenSecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.HoneyTokenSecretMapping}.secretId`
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
        .select(db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping))
        .select(db.ref("honeyTokenId").withSchema(TableName.HoneyTokenSecretMapping).as("honeyTokenId"));

      const docs = sqlNestRelationships({
        data: secrets,
        key: "id",
        parentMapper: (secret) => ({
          ...secret,
          isHoneyTokenSecret: Boolean(secret.honeyTokenId),
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
            .where(`${TableName.Environment}.projectId`, projectId)
            .whereNull(`${TableName.Environment}.deleteAfter`);
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
      references: Array<{ environment: string; secretPath: string; secretKey: string; targetProjectSlug?: string }>;
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
          references.map(({ environment, secretPath, secretKey, targetProjectSlug }) => ({
            secretPath,
            secretId,
            environment,
            secretKey,
            ...(targetProjectSlug ? { targetProjectSlug } : {})
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
        .whereNull(`${TableName.Environment}.deleteAfter`)
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
        .where({
          [`${TableName.SecretFolder}.isReserved` as "isReserved"]: false
        })
        .where("projectId", projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .select(selectAllTableCols(TableName.SecretReferenceV2))
        .select("folderId");

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindReferencedSecretReferencesBySecretKey" });
    }
  };

  const findCrossProjectSecretReferencesByTargetSecretKey = async (
    targetProjectSlug: string,
    envSlug: string,
    secretPath: string,
    secretKey: string,
    orgId: string,
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretReferenceV2)
        .where({
          [`${TableName.SecretReferenceV2}.secretPath` as "secretPath"]: secretPath,
          [`${TableName.SecretReferenceV2}.environment` as "environment"]: envSlug,
          [`${TableName.SecretReferenceV2}.secretKey` as "secretKey"]: secretKey,
          [`${TableName.SecretReferenceV2}.targetProjectSlug` as "targetProjectSlug"]: targetProjectSlug
        })
        .join(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.SecretReferenceV2}.secretId`)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .where({
          [`${TableName.SecretFolder}.isReserved` as "isReserved"]: false,
          [`${TableName.Project}.orgId` as "orgId"]: orgId
        })
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(
          selectAllTableCols(TableName.SecretReferenceV2),
          db.ref("folderId").withSchema(TableName.SecretV2),
          db.ref("key").withSchema(TableName.SecretV2).as("secretVKey"),
          db.ref("projectId").withSchema(TableName.Environment).as("referencingProjectId")
        );

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindCrossProjectSecretReferencesByTargetSecretKey" });
    }
  };

  const findCrossProjectSecretReferencesByTargetFolder = async (
    targetProjectSlug: string,
    envSlug: string,
    secretPath: string,
    orgId: string,
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretReferenceV2)
        .where({
          [`${TableName.SecretReferenceV2}.secretPath` as "secretPath"]: secretPath,
          [`${TableName.SecretReferenceV2}.environment` as "environment"]: envSlug,
          [`${TableName.SecretReferenceV2}.targetProjectSlug` as "targetProjectSlug"]: targetProjectSlug
        })
        .join(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.SecretReferenceV2}.secretId`)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .where({
          [`${TableName.SecretFolder}.isReserved` as "isReserved"]: false,
          [`${TableName.Project}.orgId` as "orgId"]: orgId
        })
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(
          db.ref("folderId").withSchema(TableName.SecretV2),
          db.ref("projectId").withSchema(TableName.Environment).as("referencingProjectId"),
          db.ref("orgId").withSchema(TableName.Project).as("referencingOrgId")
        );

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindCrossProjectSecretReferencesByTargetFolder" });
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
            .where(`${TableName.Environment}.projectId`, projectId)
            .whereNull(`${TableName.Environment}.deleteAfter`);
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
        .whereNull(`${TableName.Environment}.deleteAfter`)
        // not empty
        .whereNotNull("encryptedValue")
        .select("encryptedValue", `${TableName.SecretV2}.id` as "id");
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindAllProjectSecretValues" });
    }
  };

  const findProjectSecretsWithNullBlindIndex = async (projectId: string, limit: number, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretV2)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.SecretV2}.secretValueBlindIndex`)
        .whereNotNull(`${TableName.SecretV2}.encryptedValue`)
        .select(`${TableName.SecretV2}.id` as "id", `${TableName.SecretV2}.encryptedValue` as "encryptedValue")
        .limit(limit);
      return docs as Pick<TSecretsV2, "id" | "encryptedValue">[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindProjectSecretsWithNullBlindIndex" });
    }
  };

  const batchSetBlindIndexes = async (updates: { id: string; secretValueBlindIndex: string }[], tx?: Knex) => {
    if (updates.length === 0) return;

    try {
      const bindings: string[] = [];
      const valuePlaceholders = updates.map(({ id, secretValueBlindIndex }) => {
        bindings.push(id, secretValueBlindIndex);
        return "(CAST(? AS uuid), ?)";
      });

      const query = `
        UPDATE ${TableName.SecretV2}
        SET "secretValueBlindIndex" = v.blind_index
        FROM (VALUES ${valuePlaceholders.join(", ")}) AS v(id, blind_index)
        WHERE ${TableName.SecretV2}.id = v.id
          AND ${TableName.SecretV2}."secretValueBlindIndex" IS NULL
      `;

      await (tx || db).raw(query, bindings);
    } catch (error) {
      throw new DatabaseError({ error, name: "BatchSetBlindIndexes" });
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
        .leftJoin(TableName.Environment, function joinActiveEnvForFolder() {
          this.on(`${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
        .leftJoin(TableName.ResourceMetadata, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
        .leftJoin(
          TableName.SecretRotationV2SecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretRotationV2SecretMapping}.secretId`
        )
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
        .select(db.ref("projectId").withSchema(TableName.Environment).as("projectId"))
        .select(db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping));

      const docs = sqlNestRelationships({
        data: rawDocs,
        key: "id",
        parentMapper: (el) => ({
          _id: el.id,
          projectId: el.projectId,
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

  const findStaleByProject = async (
    projectId: string,
    staleBeforeDate: Date,
    pagination?: { offset: number; limit: number },
    tx?: Knex
  ) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.SecretV2)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.SecretV2}.userId`)
        .where(`${TableName.SecretV2}.updatedAt`, "<", staleBeforeDate)
        .select(
          `${TableName.SecretV2}.key`,
          `${TableName.SecretV2}.updatedAt`,
          `${TableName.SecretV2}.folderId`,
          `${TableName.Environment}.slug as environment`
        )
        .orderBy(`${TableName.SecretV2}.updatedAt`, "asc")
        .offset(pagination?.offset ?? 0)
        .limit(pagination?.limit ?? 50);

      return result as { key: string; updatedAt: Date; folderId: string; environment: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "findStaleByProject" });
    }
  };

  const findDuplicatedSecretValues = async (projectId: string, tx?: Knex) => {
    try {
      const duplicateBlindIndexes = (tx || db.replicaNode())(TableName.SecretV2)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.SecretV2}.userId`)
        .whereNotNull(`${TableName.SecretV2}.secretValueBlindIndex`)
        .groupBy(`${TableName.SecretV2}.secretValueBlindIndex`)
        .having(db.raw("count(*) > 1"))
        .select(`${TableName.SecretV2}.secretValueBlindIndex`)
        .orderBy(`${TableName.SecretV2}.secretValueBlindIndex`);

      const rows = await (tx || db.replicaNode())(TableName.SecretV2)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereIn(`${TableName.SecretV2}.secretValueBlindIndex`, duplicateBlindIndexes)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.SecretV2}.userId`)
        .select(
          `${TableName.SecretV2}.key`,
          `${TableName.SecretV2}.folderId`,
          `${TableName.SecretV2}.encryptedValue`,
          `${TableName.SecretV2}.secretValueBlindIndex`,
          `${TableName.Environment}.slug as environment`,
          `${TableName.Environment}.name as environmentName`
        )
        .orderBy(`${TableName.SecretV2}.secretValueBlindIndex`);

      const groups: {
        secrets: {
          key: string;
          environment: string;
          environmentName: string;
          folderId: string;
          encryptedValue: Buffer | null;
        }[];
      }[] = [];
      let currentIndex: string | null = null;
      let currentGroup: {
        key: string;
        environment: string;
        environmentName: string;
        folderId: string;
        encryptedValue: Buffer | null;
      }[] = [];

      for (const row of rows as {
        key: string;
        folderId: string;
        encryptedValue: Buffer | null;
        secretValueBlindIndex: string;
        environment: string;
        environmentName: string;
      }[]) {
        if (row.secretValueBlindIndex !== currentIndex) {
          if (currentGroup.length > 0) {
            groups.push({ secrets: currentGroup });
          }
          currentIndex = row.secretValueBlindIndex;
          currentGroup = [];
        }
        currentGroup.push({
          key: row.key,
          environment: row.environment,
          environmentName: row.environmentName,
          folderId: row.folderId,
          encryptedValue: row.encryptedValue
        });
      }
      if (currentGroup.length > 0) {
        groups.push({ secrets: currentGroup });
      }

      return groups;
    } catch (error) {
      throw new DatabaseError({ error, name: "findDuplicatedSecretValues" });
    }
  };

  const findValueValidationCandidatesByProject = async (projectId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.SecretV2)
        .leftJoin(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .leftJoin(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.SecretV2}.userId`)
        .whereNotNull(`${TableName.SecretV2}.encryptedValue`)
        .select(`${TableName.SecretV2}.key`, `${TableName.SecretV2}.folderId`, `${TableName.SecretV2}.encryptedValue`);

      return result as { key: string; folderId: string; encryptedValue: Buffer }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "findValueValidationCandidatesByProject" });
    }
  };

  const countStaleByProject = async (projectId: string, staleBeforeDate: Date, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.SecretV2)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.SecretV2}.userId`)
        .where(`${TableName.SecretV2}.updatedAt`, "<", staleBeforeDate)
        .count("* as count")
        .first();

      return Number((result as { count?: string | number })?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "countStaleByProject" });
    }
  };

  const countByProject = async (projectId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.SecretV2)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        // mirror the dashboard count (countByFolderIds): exclude personal/override secrets,
        // include honey-token + rotation backing secrets, count records (not distinct keys)
        .whereNull(`${TableName.SecretV2}.userId`)
        .count("* as count")
        .first();

      return Number((result as { count?: string | number })?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "countByProject" });
    }
  };

  return {
    ...secretOrm,
    update,
    bulkUpdate,
    bulkUpdateById,
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
    findProjectSecretsWithNullBlindIndex,
    batchSetBlindIndexes,
    countByFolderIds,
    findStaleByProject,
    countStaleByProject,
    countByProject,
    findValueValidationCandidatesByProject,
    findDuplicatedSecretValues,
    findOne,
    find,
    invalidateSecretCacheByProjectId,
    findSecretsWithReminderRecipients,
    findSecretsWithReminderRecipientsOld,
    findReferencedSecretReferencesBySecretKey,
    findCrossProjectSecretReferencesByTargetSecretKey,
    findCrossProjectSecretReferencesByTargetFolder,
    updateSecretReferenceSecretKey,
    updateSecretReferenceEnvAndPath
  };
};
