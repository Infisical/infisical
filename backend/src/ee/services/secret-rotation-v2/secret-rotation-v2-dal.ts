import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TSecretRotationsV2 } from "@app/db/schemas/secret-rotations-v2";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

export type TSecretRotationV2DALFactory = ReturnType<typeof secretRotationV2DALFactory>;

type TSecretRotationFindFilter = Parameters<typeof buildFindFilter<TSecretRotationsV2>>[0];

const baseSecretRotationV2Query = ({
  filter,
  db,
  tx
}: {
  db: TDbClient;
  filter?: TSecretRotationFindFilter;
  tx?: Knex;
}) => {
  const query = (tx || db.replicaNode())(TableName.SecretRotationV2)
    .leftJoin(TableName.SecretFolder, `${TableName.SecretRotationV2}.folderId`, `${TableName.SecretFolder}.id`)
    .leftJoin(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
    .join(TableName.AppConnection, `${TableName.SecretRotationV2}.connectionId`, `${TableName.AppConnection}.id`)
    .select(selectAllTableCols(TableName.SecretRotationV2))
    .select(
      // environment
      db.ref("name").withSchema(TableName.Environment).as("envName"),
      db.ref("id").withSchema(TableName.Environment).as("envId"),
      db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
      // entire connection
      db.ref("name").withSchema(TableName.AppConnection).as("connectionName"),
      db.ref("method").withSchema(TableName.AppConnection).as("connectionMethod"),
      db.ref("app").withSchema(TableName.AppConnection).as("connectionApp"),
      db.ref("orgId").withSchema(TableName.AppConnection).as("connectionOrgId"),
      db.ref("encryptedCredentials").withSchema(TableName.AppConnection).as("connectionEncryptedCredentials"),
      db.ref("description").withSchema(TableName.AppConnection).as("connectionDescription"),
      db.ref("version").withSchema(TableName.AppConnection).as("connectionVersion"),
      db.ref("createdAt").withSchema(TableName.AppConnection).as("connectionCreatedAt"),
      db.ref("updatedAt").withSchema(TableName.AppConnection).as("connectionUpdatedAt"),
      db.ref("isPlatformManaged").withSchema(TableName.AppConnection).as("connectionIsPlatformManaged")
    );

  if (filter) {
    /* eslint-disable @typescript-eslint/no-misused-promises */
    void query.where(buildFindFilter(prependTableNameToFindFilter(TableName.SecretRotationV2, filter)));
  }

  return query;
};

const expandSecretRotation = (
  secretSync: Awaited<ReturnType<typeof baseSecretRotationV2Query>>[number],
  folder?: Awaited<ReturnType<TSecretFolderDALFactory["findSecretPathByFolderIds"]>>[number]
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
    connectionIsPlatformManaged,
    ...el
  } = secretSync;

  return {
    ...el,
    connectionId,
    environment: envId ? { id: envId, name: envName, slug: envSlug } : null,
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
      isPlatformManaged: connectionIsPlatformManaged
    },
    folder: folder
      ? {
          id: folder.id,
          path: folder.path
        }
      : null
  };
};

export const secretRotationV2DALFactory = (
  db: TDbClient,
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">
) => {
  const secretRotationV2Orm = ormify(db, TableName.SecretRotationV2);

  const find = async (
    filter: Parameters<(typeof secretRotationV2Orm)["find"]>[0] & { projectId: string },
    tx?: Knex
  ) => {
    try {
      const secretRotations = await baseSecretRotationV2Query({ filter, db, tx });

      if (!secretRotations.length) return [];

      const foldersWithPath = await folderDAL.findSecretPathByFolderIds(
        filter.projectId,
        secretRotations.filter((rotation) => Boolean(rotation.folderId)).map((sync) => sync.folderId!)
      );

      // TODO (scott): replace with cached folder path once implemented
      const folderRecord: Record<string, (typeof foldersWithPath)[number]> = {};

      foldersWithPath.forEach((folder) => {
        if (folder) folderRecord[folder.id] = folder;
      });

      return secretRotations.map((rotation) =>
        expandSecretRotation(rotation, rotation.folderId ? folderRecord[rotation.folderId] : undefined)
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find - Secret Rotation V2" });
    }
  };

  const create = async (data: Parameters<(typeof secretRotationV2Orm)["create"]>[0]) => {
    const secretSync = (await secretRotationV2Orm.transaction(async (tx) => {
      const rotation = await secretRotationV2Orm.create(data, tx);

      return baseSecretRotationV2Query({
        filter: { id: rotation.id },
        db,
        tx
      }).first();
    }))!;

    // TODO (scott): replace with cached folder path once implemented
    const [folderWithPath] = secretSync.folderId
      ? await folderDAL.findSecretPathByFolderIds(secretSync.projectId, [secretSync.folderId])
      : [];

    return expandSecretRotation(secretSync, folderWithPath);
  };

  return { ...secretRotationV2Orm, find, create };
};
