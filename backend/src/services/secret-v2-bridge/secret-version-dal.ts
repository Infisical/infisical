/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  AccessScope,
  SecretVersionsV2Schema,
  TableName,
  TSecretVersionsV2,
  TSecretVersionsV2Update
} from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, sqlNestRelationships, TFindOpt } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";

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
        .leftJoin(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
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
    logger.info(`${QueueName.DailyResourceCleanUp}: pruning secret version v2 started`);
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
        .delete();
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Secret Version Prune"
      });
    }
    logger.info(`${QueueName.DailyResourceCleanUp}: pruning secret version v2 completed`);
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
        .leftJoin(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .leftJoin(TableName.Users, `${TableName.Users}.id`, `${TableName.SecretVersionV2}.userActorId`)
        .leftJoin(TableName.Identity, `${TableName.Identity}.id`, `${TableName.SecretVersionV2}.identityActorId`)
        .leftJoin(TableName.UserGroupMembership, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
        .leftJoin(
          TableName.IdentityGroupMembership,
          `${TableName.IdentityGroupMembership}.identityId`,
          `${TableName.Identity}.id`
        )
        .leftJoin(TableName.Membership, (qb) => {
          void qb
            .on(`${TableName.Membership}.scope`, db.raw("?", [AccessScope.Project]))
            .andOn(`${TableName.Membership}.scopeProjectId`, `${TableName.Environment}.projectId`)
            .andOn((sqb) => {
              void sqb
                .on(`${TableName.Membership}.actorUserId`, `${TableName.SecretVersionV2}.userActorId`)
                .orOn(`${TableName.Membership}.actorIdentityId`, `${TableName.SecretVersionV2}.identityActorId`)
                .orOn(`${TableName.Membership}.actorGroupId`, `${TableName.UserGroupMembership}.groupId`)
                .orOn(`${TableName.Membership}.actorGroupId`, `${TableName.IdentityGroupMembership}.groupId`);
            });
        })
        .leftJoin(TableName.SecretV2, `${TableName.SecretVersionV2}.secretId`, `${TableName.SecretV2}.id`)
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
          db.ref("username").withSchema(TableName.Users).as("userActorName"),
          db.ref("name").withSchema(TableName.Identity).as("identityActorName"),
          db.ref("id").withSchema(TableName.Membership).as("membershipId"),
          db.ref("actorGroupId").withSchema(TableName.Membership).as("groupId"),
          db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
          db.ref("color").withSchema(TableName.SecretTag).as("tagColor"),
          db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug")
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
          groupId: el.groupId
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

  return {
    ...secretVersionV2Orm,
    pruneExcessVersions,
    findLatestVersionMany,
    bulkUpdate,
    findLatestVersionByFolderId,
    findVersionsBySecretIdWithActors,
    findBySecretId,
    findByIdsWithLatestVersion,
    findByIdAndPreviousVersion,
    findOne
  };
};
