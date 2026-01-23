import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TSecretSyncs } from "@app/db/schemas/secret-syncs";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

export type TSecretSyncDALFactory = ReturnType<typeof secretSyncDALFactory>;

type SecretSyncFindFilter = Parameters<typeof buildFindFilter<TSecretSyncs>>[0];

const baseSecretSyncQuery = ({ filter, db, tx }: { db: TDbClient; filter?: SecretSyncFindFilter; tx?: Knex }) => {
  const query = (tx || db.replicaNode())(TableName.SecretSync)
    .leftJoin(TableName.SecretFolder, `${TableName.SecretSync}.folderId`, `${TableName.SecretFolder}.id`)
    .leftJoin(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
    .join(TableName.AppConnection, `${TableName.SecretSync}.connectionId`, `${TableName.AppConnection}.id`)
    .select(selectAllTableCols(TableName.SecretSync))
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
    void query.where(buildFindFilter(prependTableNameToFindFilter(TableName.SecretSync, filter)));
  }

  return query;
};

const expandSecretSync = (
  secretSync: Awaited<ReturnType<typeof baseSecretSyncQuery>>[number],
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
    connectionIsPlatformManagedCredentials,
    connectionGatewayId,
    connectionProjectId,
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
      isPlatformManagedCredentials: connectionIsPlatformManagedCredentials,
      gatewayId: connectionGatewayId,
      projectId: connectionProjectId
    },
    folder: folder
      ? {
          id: folder.id,
          path: folder.path
        }
      : null
  };
};

export const secretSyncDALFactory = (
  db: TDbClient,
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">
) => {
  const secretSyncOrm = ormify(db, TableName.SecretSync);

  const findById = async (id: string, tx?: Knex) => {
    try {
      const secretSync = await baseSecretSyncQuery({
        filter: { id },
        db,
        tx
      }).first();

      if (secretSync) {
        // TODO (scott): replace with cached folder path once implemented
        const [folderWithPath] = secretSync.folderId
          ? await folderDAL.findSecretPathByFolderIds(secretSync.projectId, [secretSync.folderId])
          : [];
        return expandSecretSync(secretSync, folderWithPath);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by ID - Secret Sync" });
    }
  };

  const create = async (data: Parameters<(typeof secretSyncOrm)["create"]>[0]) => {
    const secretSync = (await secretSyncOrm.transaction(async (tx) => {
      const sync = await secretSyncOrm.create(data, tx);

      return baseSecretSyncQuery({
        filter: { id: sync.id },
        db,
        tx
      }).first();
    }))!;

    // TODO (scott): replace with cached folder path once implemented
    const [folderWithPath] = secretSync.folderId
      ? await folderDAL.findSecretPathByFolderIds(secretSync.projectId, [secretSync.folderId])
      : [];
    return expandSecretSync(secretSync, folderWithPath);
  };

  const updateById = async (syncId: string, data: Parameters<(typeof secretSyncOrm)["updateById"]>[1]) => {
    const secretSync = (await secretSyncOrm.transaction(async (tx) => {
      const sync = await secretSyncOrm.updateById(syncId, data, tx);

      return baseSecretSyncQuery({
        filter: { id: sync.id },
        db,
        tx
      }).first();
    }))!;

    // TODO (scott): replace with cached folder path once implemented
    const [folderWithPath] = secretSync.folderId
      ? await folderDAL.findSecretPathByFolderIds(secretSync.projectId, [secretSync.folderId])
      : [];
    return expandSecretSync(secretSync, folderWithPath);
  };

  const findOne = async (filter: Parameters<(typeof secretSyncOrm)["findOne"]>[0], tx?: Knex) => {
    try {
      const secretSync = await baseSecretSyncQuery({ filter, db, tx }).first();

      if (secretSync) {
        // TODO (scott): replace with cached folder path once implemented
        const [folderWithPath] = secretSync.folderId
          ? await folderDAL.findSecretPathByFolderIds(secretSync.projectId, [secretSync.folderId])
          : [];
        return expandSecretSync(secretSync, folderWithPath);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Find One - Secret Sync" });
    }
  };

  const find = async (filter: Parameters<(typeof secretSyncOrm)["find"]>[0], tx?: Knex) => {
    try {
      const secretSyncs = await baseSecretSyncQuery({ filter, db, tx });

      if (!secretSyncs.length) return [];

      const foldersWithPath = await folderDAL.findSecretPathByFolderIds(
        secretSyncs[0].projectId,
        secretSyncs.filter((sync) => Boolean(sync.folderId)).map((sync) => sync.folderId!)
      );

      // TODO (scott): replace with cached folder path once implemented
      const folderRecord: Record<string, (typeof foldersWithPath)[number]> = {};

      foldersWithPath.forEach((folder) => {
        if (folder) folderRecord[folder.id] = folder;
      });

      return secretSyncs.map((secretSync) =>
        expandSecretSync(secretSync, secretSync.folderId ? folderRecord[secretSync.folderId] : undefined)
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find - Secret Sync" });
    }
  };

  const findByDestinationAndOrgId = async (destination: string, orgId: string, tx?: Knex) => {
    try {
      const response = await (tx || db.replicaNode())(TableName.SecretSync)
        .join(TableName.Project, `${TableName.SecretSync}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.SecretSync}.destination`, destination)
        .where(`${TableName.Project}.orgId`, orgId)
        .select(selectAllTableCols(TableName.SecretSync));

      return response;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By Destination And Org ID - Secret Sync" });
    }
  };

  return { ...secretSyncOrm, findById, findOne, find, create, updateById, findByDestinationAndOrgId };
};
