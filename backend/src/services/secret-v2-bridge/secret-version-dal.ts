/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  AccessScope,
  SecretVersionsV2Schema,
  TableName,
  TMemberships,
  TSecretVersionsV2,
  TSecretVersionsV2Update,
  TUsers
} from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, sqlNestRelationships, TFindOpt } from "@app/lib/knex";
import { logger } from "@app/lib/logger";

export type TSecretVersionV2DALFactory = ReturnType<typeof secretVersionV2BridgeDALFactory>;

export const secretVersionV2BridgeDALFactory = (db: TDbClient) => {
  const secretVersionV2Orm = ormify(db, TableName.SecretVersionV2);

  const findOne = async (filter: Partial<TSecretVersionsV2>, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.SecretVersionV2)
        // eslint-disable-next-line
        .where(buildFindFilter(filter, TableName.SecretVersionV2))
        .leftJoin(TableName.SecretV2, `${TableName.SecretVersionV2}.secretId`, `${TableName.SecretV2}.id`)
        .leftJoin(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .leftJoin(TableName.Environment, function joinActiveEnvForFolder() {
          this.on(`${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
        .select(selectAllTableCols(TableName.SecretVersionV2))
        .select(db.ref("projectId").withSchema(TableName.Environment).as("projectId"))
        .first();

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindOne" });
    }
  };

  const findBySecretId = async (secretId: string, { offset, limit, sort, tx }: TFindOpt<TSecretVersionsV2> = {}) => {
    try {
      const query = (tx || db.replicaNode())(TableName.SecretVersionV2)
        .where(`${TableName.SecretVersionV2}.secretId`, secretId)
        .leftJoin(TableName.SecretV2, `${TableName.SecretVersionV2}.secretId`, `${TableName.SecretV2}.id`)
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
        .select(selectAllTableCols(TableName.SecretVersionV2))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"));

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const docs = await query;

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({ _id: el.id, ...SecretVersionsV2Schema.parse(el) }),
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
      throw new DatabaseError({ error, name: `${TableName.SecretVersionV2}: FindBySecretId` });
    }
  };

  // This will fetch all latest secret versions from a folder
  const findLatestVersionByFolderId = async (folderId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretVersionV2)
        .where(`${TableName.SecretVersionV2}.folderId`, folderId)
        .join(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.SecretVersionV2}.secretId`)
        .join<TSecretVersionsV2, TSecretVersionsV2 & { secretId: string; max: number }>(
          (tx || db.replicaNode())(TableName.SecretVersionV2)
            .where(`${TableName.SecretVersionV2}.folderId`, folderId)
            .groupBy("secretId")
            .max("version")
            .select("secretId")
            .as("latestVersion"),
          (bd) => {
            bd.on(`${TableName.SecretVersionV2}.secretId`, "latestVersion.secretId").andOn(
              `${TableName.SecretVersionV2}.version`,
              "latestVersion.max"
            );
          }
        )
        .select(selectAllTableCols(TableName.SecretVersionV2));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestVersionByFolderId" });
    }
  };

  const bulkUpdate = async (
    data: Array<{ filter: Partial<TSecretVersionsV2>; data: TSecretVersionsV2Update }>,
    tx?: Knex
  ) => {
    try {
      const secs = await Promise.all(
        data.map(async ({ filter, data: updateData }) => {
          const [doc] = await (tx || db)(TableName.SecretVersionV2)
            .where(filter)
            .update(updateData)
            .increment("version", 1) // TODO: Is this really needed?
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

  const findLatestVersionMany = async (folderId: string, secretIds: string[], tx?: Knex) => {
    try {
      if (!secretIds.length) return {};
      const docs: Array<TSecretVersionsV2 & { max: number }> = await (tx || db.replicaNode())(TableName.SecretVersionV2)
        .where("folderId", folderId)
        .whereIn(`${TableName.SecretVersionV2}.secretId`, secretIds)
        .join(
          (tx || db.replicaNode())(TableName.SecretVersionV2)
            .whereIn("secretId", secretIds)
            .groupBy("secretId")
            .max("version")
            .select("secretId")
            .as("latestVersion"),
          (bd) => {
            bd.on(`${TableName.SecretVersionV2}.secretId`, "latestVersion.secretId").andOn(
              `${TableName.SecretVersionV2}.version`,
              "latestVersion.max"
            );
          }
        );
      return docs.reduce<Record<string, TSecretVersionsV2>>(
        (prev, curr) => ({ ...prev, [curr.secretId || ""]: curr }),
        {}
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestVersionMany" });
    }
  };

  const pruneExcessVersions = async () => {
    logger.info(`daily-resource-cleanup: pruning secret version v2 started`);
    try {
      await db(TableName.SecretVersionV2)
        .with("version_cte", (qb) => {
          void qb
            .from(TableName.SecretVersionV2)
            .select(
              "id",
              "folderId",
              db.raw(
                `ROW_NUMBER() OVER (PARTITION BY ${TableName.SecretVersionV2}."secretId" ORDER BY ${TableName.SecretVersionV2}."createdAt" DESC) AS row_num`
              )
            );
        })
        .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.SecretVersionV2}.folderId`)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Environment}.projectId`)
        .join("version_cte", "version_cte.id", `${TableName.SecretVersionV2}.id`)
        .whereRaw(`version_cte.row_num > ${TableName.Project}."pitVersionLimit"`)
        // Projects with version >= 3 will require to have all secret versions for PIT
        .andWhere(`${TableName.Project}.version`, "<", 3)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .delete();
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Secret Version Prune"
      });
    }
    logger.info(`daily-resource-cleanup: pruning secret version v2 completed`);
  };

  // Reclaims secret_versions_v2 rows whose folderId no longer exists in secret_folders.
  // These accumulate when an environment (or folder) is hard-deleted: the table has no FK on
  // folderId, so the cascade orphans the history. Env hard-delete now prunes versions first;
  // this drains the historical backlog slowly.
  const pruneOrphanedVersions = async (): Promise<number> => {
    const BATCH_SIZE = 5000;
    const STATEMENT_TIMEOUT_MS = 30 * 1000;

    logger.info(`daily-secret-version-cleanup: pruning orphaned secret versions v2 started`);
    try {
      const deleted = await db.transaction(async (tx): Promise<number> => {
        await tx.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        const idsToDelete = tx(TableName.SecretVersionV2)
          .whereNotExists(
            (qb) =>
              void qb
                .select(tx.raw("1"))
                .from(TableName.SecretFolder)
                .whereRaw(`"${TableName.SecretFolder}"."id" = "${TableName.SecretVersionV2}"."folderId"`)
          )
          .select("id")
          .limit(BATCH_SIZE);
        return tx(TableName.SecretVersionV2).whereIn("id", idsToDelete).delete();
      });
      logger.info(
        `daily-secret-version-cleanup: pruning orphaned secret versions v2 completed [deleted=${deleted}]${
          deleted >= BATCH_SIZE ? " (more remain; will continue next run)" : ""
        }`
      );
      return deleted;
    } catch (err) {
      logger.error(err, "Failed to prune orphaned secret versions v2");
      throw new DatabaseError({ error: err, name: "Secret Version Orphan Prune" });
    }
  };

  const findVersionsBySecretIdWithActors = async ({
    secretId,
    secretVersions,
    findOpt = {},
    tx
  }: {
    secretId: string;
    projectId: string;
    secretVersions?: string[];
    findOpt?: TFindOpt<TSecretVersionsV2>;
    tx?: Knex;
  }) => {
    try {
      const { offset, limit, sort = [["createdAt", "desc"]] } = findOpt;
      const query = (tx || db.replicaNode())(TableName.SecretVersionV2)
        .leftJoin(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.SecretVersionV2}.folderId`)
        .leftJoin(TableName.Environment, function joinActiveEnvForFolder() {
          this.on(`${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
        .leftJoin<TUsers>(
          `${TableName.Users} as user_actor`,
          "user_actor.id",
          `${TableName.SecretVersionV2}.userActorId`
        )
        .leftJoin<TUsers>(
          `${TableName.Users} as redacted_by_user`,
          "redacted_by_user.id",
          `${TableName.SecretVersionV2}.redactedByUserId`
        )
        .leftJoin(TableName.Identity, `${TableName.Identity}.id`, `${TableName.SecretVersionV2}.identityActorId`)
        .leftJoin(
          TableName.UserGroupMembership,
          `${TableName.UserGroupMembership}.userId`,
          `user_actor.id` as `${TableName.Users}.id`
        )
        .leftJoin(
          TableName.IdentityGroupMembership,
          `${TableName.IdentityGroupMembership}.identityId`,
          `${TableName.Identity}.id`
        )
        .leftJoin<TMemberships>(`${TableName.Membership} as actorMembership`, (qb) => {
          void qb
            .on(`actorMembership.scope`, db.raw("?", [AccessScope.Project]))
            .andOn(`actorMembership.scopeProjectId`, `${TableName.Environment}.projectId`)
            .andOn((sqb) => {
              void sqb
                .on(`actorMembership.actorUserId`, `${TableName.SecretVersionV2}.userActorId`)
                .orOn(`actorMembership.actorIdentityId`, `${TableName.SecretVersionV2}.identityActorId`)
                .orOn(`actorMembership.actorGroupId`, `${TableName.UserGroupMembership}.groupId`)
                .orOn(`actorMembership.actorGroupId`, `${TableName.IdentityGroupMembership}.groupId`);
            });
        })

        .leftJoin<TMemberships>(`${TableName.Membership} as redactedByMembership`, (qb) => {
          void qb
            .on(`redactedByMembership.scope`, db.raw("?", [AccessScope.Project]))
            .andOn(`redactedByMembership.scopeProjectId`, `${TableName.Environment}.projectId`)
            .andOn(`redactedByMembership.actorUserId`, `${TableName.SecretVersionV2}.redactedByUserId`);
        })

        .leftJoin(TableName.SecretV2, `${TableName.SecretVersionV2}.secretId`, `${TableName.SecretV2}.id`)
        .leftJoin(
          TableName.HoneyTokenSecretMapping,
          `${TableName.SecretV2}.id`,
          `${TableName.HoneyTokenSecretMapping}.secretId`
        )
        .leftJoin(
          TableName.SecretVersionV2Tag,
          `${TableName.SecretVersionV2}.id`,
          `${TableName.SecretVersionV2Tag}.${TableName.SecretVersionV2}Id`
        )
        .leftJoin(
          TableName.SecretTag,
          `${TableName.SecretVersionV2Tag}.${TableName.SecretTag}Id`,
          `${TableName.SecretTag}.id`
        )
        .where((qb) => {
          void qb.where(`${TableName.SecretVersionV2}.secretId`, secretId);
          if (secretVersions?.length) void qb.whereIn(`${TableName.SecretVersionV2}.version`, secretVersions);
        })
        .select(
          selectAllTableCols(TableName.SecretVersionV2),
          db.ref("username").withSchema("user_actor").as("userActorName"),
          db.ref("username").withSchema("redacted_by_user").as("redactedByUserName"),
          db.ref("email").withSchema("redacted_by_user").as("redactedByUserEmail"),
          db.ref("name").withSchema(TableName.Identity).as("identityActorName"),
          db.ref("id").withSchema("actorMembership").as("membershipId"),
          db.ref("id").withSchema("redactedByMembership").as("redactedByMembershipId"),
          db.ref("actorGroupId").withSchema("actorMembership").as("groupId"),
          db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
          db.ref("color").withSchema(TableName.SecretTag).as("tagColor"),
          db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"),
          db.ref("honeyTokenId").withSchema(TableName.HoneyTokenSecretMapping).as("honeyTokenId")
        );

      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(
          sort.map(([column, order, nulls]) => ({
            column: `${TableName.SecretVersionV2}.${column as string}`,
            order,
            nulls
          }))
        );
      }

      const docs = await query;

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          _id: el.id,
          ...SecretVersionsV2Schema.parse(el),
          userActorName: el.userActorName,
          identityActorName: el.identityActorName,
          membershipId: el.membershipId,
          groupId: el.groupId,
          redactedByUserEmail: el.redactedByUserEmail,
          redactedByUserName: el.redactedByUserName,
          redactedByMembershipId: el.redactedByMembershipId,
          isHoneyTokenSecret: Boolean(el.honeyTokenId)
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
          }
        ]
      });

      return data;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindVersionsBySecretIdWithActors" });
    }
  };

  // Function to fetch latest versions by secretIds
  const getLatestVersionsBySecretIds = async (
    folderId: string,
    secretIds: string[],
    tx?: Knex
  ): Promise<Array<TSecretVersionsV2>> => {
    if (!secretIds.length) return [];

    const knexInstance = tx || db.replicaNode();
    return knexInstance(TableName.SecretVersionV2)
      .where("folderId", folderId)
      .whereIn(`${TableName.SecretVersionV2}.secretId`, secretIds)
      .join(
        knexInstance(TableName.SecretVersionV2)
          .whereIn("secretId", secretIds)
          .groupBy("secretId")
          .max("version")
          .select("secretId")
          .as("latestVersion"),
        (bd) => {
          bd.on(`${TableName.SecretVersionV2}.secretId`, "latestVersion.secretId").andOn(
            `${TableName.SecretVersionV2}.version`,
            "latestVersion.max"
          );
        }
      );
  };

  // Function to fetch specific versions by versionIds
  const getSpecificVersionsWithLatestInfo = async (
    folderId: string,
    versionIds: string[],
    tx?: Knex
  ): Promise<Array<TSecretVersionsV2>> => {
    if (!versionIds.length) return [];

    const knexInstance = tx || db.replicaNode();

    // Get the specific versions
    const specificVersions = await knexInstance(TableName.SecretVersionV2)
      .where("folderId", folderId)
      .whereIn("id", versionIds);

    // Get the secretIds from these versions
    const specificSecretIds = [...new Set(specificVersions.map((v) => v.secretId).filter(Boolean))];

    if (!specificSecretIds.length) return specificVersions;

    // Get max versions for these secretIds
    const maxVersionsQuery = await knexInstance(TableName.SecretVersionV2)
      .whereIn("secretId", specificSecretIds)
      .groupBy("secretId")
      .select("secretId")
      .max("version", { as: "maxVersion" });

    // Create a lookup map for max versions
    const maxVersionMap = maxVersionsQuery.reduce(
      (acc, item) => {
        acc[item.secretId] = item.maxVersion;
        return acc;
      },
      {} as Record<string, number>
    );

    // Update the version field with maxVersion when needed
    return specificVersions.map((version) => {
      // Replace version with maxVersion
      return {
        ...version,
        version: maxVersionMap[version.secretId] || version.version
      };
    });
  };

  const findByIdsWithLatestVersion = async (
    folderId: string,
    secretIds: string[],
    versionIds?: string[],
    tx?: Knex
  ) => {
    try {
      if (!secretIds.length && (!versionIds || !versionIds.length)) return {};

      const [latestVersions, specificVersionsWithLatest] = await Promise.all([
        secretIds.length ? getLatestVersionsBySecretIds(folderId, secretIds, tx) : [],
        versionIds?.length ? getSpecificVersionsWithLatestInfo(folderId, versionIds, tx) : []
      ]);

      const allDocs = [...latestVersions, ...specificVersionsWithLatest];

      // Convert array to record with secretId as key
      return allDocs.reduce<Record<string, TSecretVersionsV2>>(
        (prev, curr) => ({ ...prev, [curr.secretId || ""]: curr }),
        {}
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByIdsWithLatestVersion" });
    }
  };

  const findByIdAndPreviousVersion = async (secretVersionId: string, tx?: Knex) => {
    try {
      const targetSecretVersion = await (tx || db.replicaNode())(TableName.SecretVersionV2)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ id: secretVersionId }, TableName.SecretVersionV2))
        .leftJoin(
          TableName.SecretVersionV2Tag,
          `${TableName.SecretVersionV2}.id`,
          `${TableName.SecretVersionV2Tag}.${TableName.SecretVersionV2}Id`
        )
        .leftJoin(
          TableName.SecretTag,
          `${TableName.SecretVersionV2Tag}.${TableName.SecretTag}Id`,
          `${TableName.SecretTag}.id`
        )
        .select(selectAllTableCols(TableName.SecretVersionV2))
        .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
        .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
        .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
        .first();
      if (targetSecretVersion) {
        const previousSecretVersion = await (tx || db.replicaNode())(TableName.SecretVersionV2)
          .where(
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            buildFindFilter(
              { version: targetSecretVersion.version - 1, secretId: targetSecretVersion.secretId },
              TableName.SecretVersionV2
            )
          )
          .leftJoin(
            TableName.SecretVersionV2Tag,
            `${TableName.SecretVersionV2}.id`,
            `${TableName.SecretVersionV2Tag}.${TableName.SecretVersionV2}Id`
          )
          .leftJoin(
            TableName.SecretTag,
            `${TableName.SecretVersionV2Tag}.${TableName.SecretTag}Id`,
            `${TableName.SecretTag}.id`
          )
          .select(selectAllTableCols(TableName.SecretVersionV2))
          .select(db.ref("id").withSchema(TableName.SecretTag).as("tagId"))
          .select(db.ref("color").withSchema(TableName.SecretTag).as("tagColor"))
          .select(db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"))
          .first();
        if (!previousSecretVersion) return [];
        const docs = [previousSecretVersion, targetSecretVersion];

        const data = sqlNestRelationships({
          data: docs,
          key: "id",
          parentMapper: (el) => ({ _id: el.id, ...SecretVersionsV2Schema.parse(el) }),
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
      }
      return [];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByIdAndPreviousVersion" });
    }
  };

  const findByParentVersionIds = async (parentVersionIds: string[], tx?: Knex): Promise<TSecretVersionsV2[]> => {
    if (!parentVersionIds.length) return [];
    try {
      const docs = await (tx || db)(TableName.SecretVersionV2).whereIn("parentVersionId", parentVersionIds).select("*");
      return docs.map((doc) => SecretVersionsV2Schema.parse(doc));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByParentVersionIds" });
    }
  };

  return {
    ...secretVersionV2Orm,
    pruneExcessVersions,
    pruneOrphanedVersions,
    findLatestVersionMany,
    bulkUpdate,
    findLatestVersionByFolderId,
    findVersionsBySecretIdWithActors,
    findBySecretId,
    findByIdsWithLatestVersion,
    findByIdAndPreviousVersion,
    findOne,
    findByParentVersionIds
  };
};
