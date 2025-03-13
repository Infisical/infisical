import { Knex } from "knex";
import { validate as uuidValidate } from "uuid";

import { TDbClient } from "@app/db";
import { SecretsSchema, SecretType, TableName, TSecrets, TSecretsUpdate } from "@app/db/schemas";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName, TQueueServiceFactory } from "@app/queue";

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

  const pruneSecretReminders = async (queueService: TQueueServiceFactory) => {
    const REMINDER_PRUNE_BATCH_SIZE = 5_000;
    const MAX_RETRY_ON_FAILURE = 3;
    let numberOfRetryOnFailure = 0;
    let deletedReminderCount = 0;

    logger.info(`${QueueName.DailyResourceCleanUp}: secret reminders started`);

    try {
      const repeatableJobs = await queueService.getRepeatableJobs(QueueName.SecretReminder);
      const reminderJobs = repeatableJobs
        .map((job) => ({ secretId: job.id?.replace("reminder-", "") as string, jobKey: job.key }))
        .filter(Boolean);

      if (reminderJobs.length === 0) {
        logger.info(`${QueueName.DailyResourceCleanUp}: no reminder jobs found`);
        return;
      }

      for (let offset = 0; offset < reminderJobs.length; offset += REMINDER_PRUNE_BATCH_SIZE) {
        try {
          const batchIds = reminderJobs.slice(offset, offset + REMINDER_PRUNE_BATCH_SIZE).map((r) => r.secretId);

          const payload = {
            $in: {
              id: batchIds
            }
          };

          const opts = {
            limit: REMINDER_PRUNE_BATCH_SIZE
          };

          // Find existing secrets with pagination
          // eslint-disable-next-line no-await-in-loop
          const [secrets, secretsV2] = await Promise.all([
            ormify(db, TableName.Secret).find(payload, opts),
            ormify(db, TableName.SecretV2).find(payload, opts)
          ]);

          const foundSecretIds = new Set([
            ...secrets.map((secret) => secret.id),
            ...secretsV2.map((secret) => secret.id)
          ]);

          // Find IDs that don't exist in either table
          const secretIdsNotFound = batchIds.filter((secretId) => !foundSecretIds.has(secretId));

          // Delete reminders for non-existent secrets
          for (const secretId of secretIdsNotFound) {
            const jobKey = reminderJobs.find((r) => r.secretId === secretId)?.jobKey;

            if (jobKey) {
              // eslint-disable-next-line no-await-in-loop
              await queueService.stopRepeatableJobByKey(QueueName.SecretReminder, jobKey);
              deletedReminderCount += 1;
            }
          }

          numberOfRetryOnFailure = 0;
        } catch (error) {
          numberOfRetryOnFailure += 1;
          logger.error(error, `Failed to process batch at offset ${offset}`);

          if (numberOfRetryOnFailure >= MAX_RETRY_ON_FAILURE) {
            break;
          }

          // Retry the current batch
          offset -= REMINDER_PRUNE_BATCH_SIZE;

          // eslint-disable-next-line no-promise-executor-return, @typescript-eslint/no-loop-func, no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 500 * numberOfRetryOnFailure));
        }

        // Small delay between batches
        // eslint-disable-next-line no-promise-executor-return, @typescript-eslint/no-loop-func, no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } catch (error) {
      logger.error(error, "Failed to complete secret reminder pruning");
    } finally {
      logger.info(
        `${QueueName.DailyResourceCleanUp}: secret reminders completed. Deleted ${deletedReminderCount} reminders`
      );
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
    pruneSecretReminders,
    findManySecretsWithTags
  };
};
