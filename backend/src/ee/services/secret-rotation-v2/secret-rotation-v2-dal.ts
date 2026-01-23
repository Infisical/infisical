import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TSecretRotationsV2 } from "@app/db/schemas/secret-rotations-v2";
import { DatabaseError } from "@app/lib/errors";
import {
  buildFindFilter,
  ormify,
  prependTableNameToFindFilter,
  selectAllTableCols,
  sqlNestRelationships,
  TFindOpt
} from "@app/lib/knex";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

export type TSecretRotationV2DALFactory = ReturnType<typeof secretRotationV2DALFactory>;

type TSecretRotationFindFilter = Parameters<typeof buildFindFilter<TSecretRotationsV2>>[0];
type TSecretRotationFindOptions = TFindOpt<TSecretRotationsV2, true, "name">;

const baseSecretRotationV2Query = ({
  filter = {},
  options,
  db,
  tx
}: {
  db: TDbClient;
  filter?: { projectId?: string } & TSecretRotationFindFilter;
  options?: TSecretRotationFindOptions;
  tx?: Knex;
}) => {
  const { projectId, ...filters } = filter;

  const query = (tx || db.replicaNode())(TableName.SecretRotationV2)
    .join(TableName.SecretFolder, `${TableName.SecretRotationV2}.folderId`, `${TableName.SecretFolder}.id`)
    .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
    .join(TableName.AppConnection, `${TableName.SecretRotationV2}.connectionId`, `${TableName.AppConnection}.id`)
    .select(selectAllTableCols(TableName.SecretRotationV2))
    .select(
      // environment
      db.ref("name").withSchema(TableName.Environment).as("envName"),
      db.ref("id").withSchema(TableName.Environment).as("envId"),
      db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
      db.ref("projectId").withSchema(TableName.Environment),
      // entire connection
      db.ref("name").withSchema(TableName.AppConnection).as("connectionName"),
      db.ref("method").withSchema(TableName.AppConnection).as("connectionMethod"),
      db.ref("app").withSchema(TableName.AppConnection).as("connectionApp"),
      db.ref("orgId").withSchema(TableName.AppConnection).as("connectionOrgId"),
      db.ref("encryptedCredentials").withSchema(TableName.AppConnection).as("connectionEncryptedCredentials"),
      db.ref("description").withSchema(TableName.AppConnection).as("connectionDescription"),
      db.ref("version").withSchema(TableName.AppConnection).as("connectionVersion"),
      db.ref("gatewayId").withSchema(TableName.AppConnection).as("connectionGatewayId"),
      db.ref("projectId").withSchema(TableName.AppConnection).as("connectionProjectId"),
      db.ref("createdAt").withSchema(TableName.AppConnection).as("connectionCreatedAt"),
      db.ref("updatedAt").withSchema(TableName.AppConnection).as("connectionUpdatedAt"),
      db
        .ref("isPlatformManagedCredentials")
        .withSchema(TableName.AppConnection)
        .as("connectionIsPlatformManagedCredentials")
    );

  if (filter) {
    /* eslint-disable @typescript-eslint/no-misused-promises */
    void query.where(buildFindFilter(prependTableNameToFindFilter(TableName.SecretRotationV2, filters)));
  }

  if (projectId) {
    void query.where(`${TableName.Environment}.projectId`, projectId);
  }

  if (options) {
    const { offset, limit, sort, count, countDistinct } = options;
    if (countDistinct) {
      void query.countDistinct(countDistinct);
    } else if (count) {
      void query.select(db.raw("COUNT(*) OVER() AS count"));
      void query.select("*");
    }
    if (limit) void query.limit(limit);
    if (offset) void query.offset(offset);
    if (sort) {
      void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
    }
  }

  return query;
};

const expandSecretRotation = <T extends Awaited<ReturnType<typeof baseSecretRotationV2Query>>[number]>(
  secretRotation: T,
  folder: Awaited<ReturnType<TSecretFolderDALFactory["findSecretPathByFolderIds"]>>[number]
) => {
  const {
    envId,
    envName,
    envSlug,
    connectionApp,
    connectionName,
    connectionId,
    connectionOrgId,
    connectionEncryptedCredentials,
    connectionMethod,
    connectionDescription,
    connectionCreatedAt,
    connectionUpdatedAt,
    connectionVersion,
    connectionGatewayId,
    connectionProjectId,
    connectionIsPlatformManagedCredentials,
    ...el
  } = secretRotation;

  return {
    ...el,
    connectionId,
    environment: { id: envId, name: envName, slug: envSlug },
    connection: {
      app: connectionApp,
      id: connectionId,
      name: connectionName,
      orgId: connectionOrgId,
      encryptedCredentials: connectionEncryptedCredentials,
      method: connectionMethod,
      description: connectionDescription,
      createdAt: connectionCreatedAt,
      updatedAt: connectionUpdatedAt,
      version: connectionVersion,
      gatewayId: connectionGatewayId,
      projectId: connectionProjectId,
      isPlatformManagedCredentials: connectionIsPlatformManagedCredentials
    },
    folder: {
      id: folder!.id,
      path: folder!.path
    }
  };
};

export const secretRotationV2DALFactory = (
  db: TDbClient,
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">
) => {
  const secretRotationV2Orm = ormify(db, TableName.SecretRotationV2);
  const secretRotationV2SecretMappingOrm = ormify(db, TableName.SecretRotationV2SecretMapping);

  const find = async (
    filter: Parameters<(typeof secretRotationV2Orm)["find"]>[0] & { projectId: string },
    options?: TSecretRotationFindOptions,
    tx?: Knex
  ) => {
    try {
      const secretRotations = await baseSecretRotationV2Query({ filter, db, tx, options });

      if (!secretRotations.length) return [];

      const foldersWithPath = await folderDAL.findSecretPathByFolderIds(
        filter.projectId,
        secretRotations.map((rotation) => rotation.folderId),
        tx
      );

      const folderRecord: Record<string, (typeof foldersWithPath)[number]> = {};

      foldersWithPath.forEach((folder) => {
        if (folder) folderRecord[folder.id] = folder;
      });

      return secretRotations.map((rotation) => expandSecretRotation(rotation, folderRecord[rotation.folderId]));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find - Secret Rotation V2" });
    }
  };

  const findWithMappedSecretsCount = async (
    {
      search,
      projectId,
      ...filter
    }: Parameters<(typeof secretRotationV2Orm)["find"]>[0] & { projectId: string; search?: string },
    tx?: Knex
  ) => {
    const query = (tx || db.replicaNode())(TableName.SecretRotationV2)
      .join(TableName.SecretFolder, `${TableName.SecretRotationV2}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(
        TableName.SecretRotationV2SecretMapping,
        `${TableName.SecretRotationV2SecretMapping}.rotationId`,
        `${TableName.SecretRotationV2}.id`
      )
      .join(TableName.SecretV2, `${TableName.SecretRotationV2SecretMapping}.secretId`, `${TableName.SecretV2}.id`)
      .where(`${TableName.Environment}.projectId`, projectId)
      .where(buildFindFilter(prependTableNameToFindFilter(TableName.SecretRotationV2, filter)))
      .countDistinct(`${TableName.SecretRotationV2}.name`);

    if (search) {
      void query.where((qb) => {
        void qb
          .whereILike(`${TableName.SecretV2}.key`, `%${search}%`)
          .orWhereILike(`${TableName.SecretRotationV2}.name`, `%${search}%`);
      });
    }

    const result = await query;

    // @ts-expect-error knex infers wrong type...
    return Number(result[0]?.count ?? 0);
  };

  const findWithMappedSecrets = async (
    { search, ...filter }: Parameters<(typeof secretRotationV2Orm)["find"]>[0] & { projectId: string; search?: string },
    options?: TSecretRotationFindOptions,
    tx?: Knex
  ) => {
    try {
      const { limit, offset = 0, sort, ...queryOptions } = options || {};
      const baseOptions = { ...queryOptions };

      const subquery = baseSecretRotationV2Query({ filter, db, tx, options: baseOptions })
        .join(
          TableName.SecretRotationV2SecretMapping,
          `${TableName.SecretRotationV2SecretMapping}.rotationId`,
          `${TableName.SecretRotationV2}.id`
        )
        .join(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.SecretRotationV2SecretMapping}.secretId`)
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
        .select(
          selectAllTableCols(TableName.SecretRotationV2),
          db.ref("id").withSchema(TableName.SecretV2).as("secretId"),
          db.ref("key").withSchema(TableName.SecretV2).as("secretKey"),
          db.ref("version").withSchema(TableName.SecretV2).as("secretVersion"),
          db.ref("type").withSchema(TableName.SecretV2).as("secretType"),
          db.ref("encryptedValue").withSchema(TableName.SecretV2).as("secretEncryptedValue"),
          db.ref("encryptedComment").withSchema(TableName.SecretV2).as("secretEncryptedComment"),
          db.ref("reminderNote").withSchema(TableName.SecretV2).as("secretReminderNote"),
          db.ref("reminderRepeatDays").withSchema(TableName.SecretV2).as("secretReminderRepeatDays"),
          db.ref("skipMultilineEncoding").withSchema(TableName.SecretV2).as("secretSkipMultilineEncoding"),
          db.ref("metadata").withSchema(TableName.SecretV2).as("secretMetadata"),
          db.ref("userId").withSchema(TableName.SecretV2).as("secretUserId"),
          db.ref("folderId").withSchema(TableName.SecretV2).as("secretFolderId"),
          db.ref("createdAt").withSchema(TableName.SecretV2).as("secretCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.SecretV2).as("secretUpdatedAt"),
          db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
          db.ref("color").withSchema(TableName.SecretTag).as("tagColor"),
          db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug"),
          db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue"),
          db.ref("encryptedValue").withSchema(TableName.ResourceMetadata).as("metadataEncryptedValue"),
          db.raw(`DENSE_RANK() OVER (ORDER BY ${TableName.SecretRotationV2}."createdAt" DESC) as rank`)
        );

      if (search) {
        void subquery.where((qb) => {
          void qb
            .whereILike(`${TableName.SecretV2}.key`, `%${search}%`)
            .orWhereILike(`${TableName.SecretRotationV2}.name`, `%${search}%`);
        });
      }

      let secretRotations: Awaited<typeof subquery>;
      if (limit !== undefined) {
        const rankOffset = offset + 1;
        const queryWithLimit = (tx || db)
          .with("inner", subquery)
          .select("*")
          .from("inner")
          .where("inner.rank", ">=", rankOffset)
          .andWhere("inner.rank", "<", rankOffset + limit);
        secretRotations = (await queryWithLimit) as unknown as Awaited<typeof subquery>;
      } else {
        secretRotations = await subquery;
      }

      if (!secretRotations.length) return [];

      const foldersWithPath = await folderDAL.findSecretPathByFolderIds(
        filter.projectId,
        secretRotations.map((rotation) => rotation.folderId),
        tx
      );

      const folderRecord: Record<string, (typeof foldersWithPath)[number]> = {};

      foldersWithPath.forEach((folder) => {
        if (folder) folderRecord[folder.id] = folder;
      });

      return sqlNestRelationships({
        data: secretRotations,
        key: "id",
        parentMapper: (rotation) => expandSecretRotation(rotation, folderRecord[rotation.folderId]),
        childrenMapper: [
          {
            key: "secretId",
            label: "secrets" as const,
            mapper: ({
              secretId,
              secretKey,
              secretVersion,
              secretType,
              secretEncryptedValue,
              secretEncryptedComment,
              secretReminderNote,
              secretReminderRepeatDays,
              secretSkipMultilineEncoding,
              secretMetadata,
              secretUserId,
              secretFolderId,
              secretCreatedAt,
              secretUpdatedAt,
              id
            }) => ({
              id: secretId,
              key: secretKey,
              version: secretVersion,
              type: secretType,
              encryptedValue: secretEncryptedValue,
              encryptedComment: secretEncryptedComment,
              reminderNote: secretReminderNote,
              reminderRepeatDays: secretReminderRepeatDays,
              skipMultilineEncoding: secretSkipMultilineEncoding,
              metadata: secretMetadata,
              userId: secretUserId,
              folderId: secretFolderId,
              createdAt: secretCreatedAt,
              updatedAt: secretUpdatedAt,
              rotationId: id,
              isRotatedSecret: true
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
          }
        ]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find with Mapped Secrets - Secret Rotation V2" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const secretRotation = await baseSecretRotationV2Query({
        filter: { id },
        db,
        tx
      }).first();

      if (secretRotation) {
        const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(
          secretRotation.projectId,
          [secretRotation.folderId],
          tx
        );
        return expandSecretRotation(secretRotation, folderWithPath);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by ID - Secret Rotation V2" });
    }
  };

  const create = async (data: Parameters<(typeof secretRotationV2Orm)["create"]>[0], tx?: Knex) => {
    const rotation = await secretRotationV2Orm.create(data, tx);

    const secretRotation = (await baseSecretRotationV2Query({
      filter: { id: rotation.id },
      db,
      tx
    }).first())!;

    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(
      secretRotation.projectId,
      [secretRotation.folderId],
      tx
    );

    return expandSecretRotation(secretRotation, folderWithPath);
  };

  const updateById = async (
    rotationId: string,
    data: Parameters<(typeof secretRotationV2Orm)["updateById"]>[1],
    tx?: Knex
  ) => {
    const rotation = await secretRotationV2Orm.updateById(rotationId, data, tx);

    const secretRotation = (await baseSecretRotationV2Query({
      filter: { id: rotation.id },
      db,
      tx
    }).first())!;

    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(
      secretRotation.projectId,
      [secretRotation.folderId],
      tx
    );

    return expandSecretRotation(secretRotation, folderWithPath);
  };

  const deleteById = async (rotationId: string, tx?: Knex) => {
    const secretRotation = (await baseSecretRotationV2Query({
      filter: { id: rotationId },
      db,
      tx
    }).first())!;

    await secretRotationV2Orm.deleteById(rotationId, tx);

    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(
      secretRotation.projectId,
      [secretRotation.folderId],
      tx
    );

    return expandSecretRotation(secretRotation, folderWithPath);
  };

  const findOne = async (filter: Parameters<(typeof secretRotationV2Orm)["findOne"]>[0], tx?: Knex) => {
    try {
      const secretRotation = await baseSecretRotationV2Query({ filter, db, tx }).first();

      if (secretRotation) {
        const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(
          secretRotation.projectId,
          [secretRotation.folderId],
          tx
        );

        return expandSecretRotation(secretRotation, folderWithPath);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Find One - Secret Rotation V2" });
    }
  };

  const findSecretRotationsToQueue = async (rotateBy: Date, tx?: Knex) => {
    const secretRotations = await (tx || db.replicaNode())(TableName.SecretRotationV2)
      .where(`${TableName.SecretRotationV2}.isAutoRotationEnabled`, true)
      .whereNotNull(`${TableName.SecretRotationV2}.nextRotationAt`)
      .andWhereRaw(`"nextRotationAt" <= ?`, [rotateBy])
      .select(selectAllTableCols(TableName.SecretRotationV2));

    return secretRotations;
  };

  return {
    ...secretRotationV2Orm,
    find,
    create,
    findById,
    updateById,
    deleteById,
    findOne,
    insertSecretMappings: secretRotationV2SecretMappingOrm.insertMany,
    findWithMappedSecrets,
    findWithMappedSecretsCount,
    findSecretRotationsToQueue
  };
};
