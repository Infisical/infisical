import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TSecretSyncs } from "@app/db/schemas/secret-syncs";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols } from "@app/lib/knex";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

export type TSecretSyncDALFactory = ReturnType<typeof secretSyncDALFactory>;

type SecretSyncFindFilter = Parameters<typeof buildFindFilter<TSecretSyncs>>[0];

const baseSecretSyncQuery = ({ filter, db, tx }: { db: TDbClient; filter?: SecretSyncFindFilter; tx?: Knex }) => {
  const query = (tx || db.replicaNode())(TableName.SecretSync)
    .join(TableName.SecretFolder, `${TableName.SecretSync}.folderId`, `${TableName.SecretFolder}.id`)
    .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
    .join(TableName.AppConnection, `${TableName.SecretSync}.connectionId`, `${TableName.AppConnection}.id`)
    .select(selectAllTableCols(TableName.SecretSync))
    .select(
      // evironment
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
      db.ref("createdAt").withSchema(TableName.AppConnection).as("connectionCreatedAt"),
      db.ref("updatedAt").withSchema(TableName.AppConnection).as("connectionUpdatedAt")
    );

  // prepends table name to filter keys to avoid ambiguous col references, skipping utility filters like $in, etc.
  const prependTableName = (filterObj: object): SecretSyncFindFilter =>
    Object.fromEntries(
      Object.entries(filterObj).map(([key, value]) =>
        key.startsWith("$") ? [key, prependTableName(value as object)] : [`${TableName.SecretSync}.${key}`, value]
      )
    );

  if (filter) {
    /* eslint-disable @typescript-eslint/no-misused-promises */
    void query.where(buildFindFilter(prependTableName(filter)));
  }

  return query;
};

const expandSecretSync = (
  secretSync: Awaited<ReturnType<typeof baseSecretSyncQuery>>[number],
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
    ...el
  } = secretSync;

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
      version: connectionVersion
    },
    folder: {
      id: folder!.id,
      path: folder!.path
    }
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
        const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(secretSync.projectId, [secretSync.folderId]);
        return expandSecretSync(secretSync, folderWithPath);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by ID - Secret Sync" });
    }
  };

  const create = async (data: Parameters<(typeof secretSyncOrm)["create"]>[0]) => {
    try {
      const secretSync = (await secretSyncOrm.transaction(async (tx) => {
        const sync = await secretSyncOrm.create(data, tx);

        return baseSecretSyncQuery({
          filter: { id: sync.id },
          db,
          tx
        }).first();
      }))!;

      // TODO (scott): replace with cached folder path once implemented
      const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(secretSync.projectId, [secretSync.folderId]);
      return expandSecretSync(secretSync, folderWithPath);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create - Secret Sync" });
    }
  };

  const updateById = async (syncId: string, data: Parameters<(typeof secretSyncOrm)["updateById"]>[1]) => {
    try {
      const secretSync = (await secretSyncOrm.transaction(async (tx) => {
        const sync = await secretSyncOrm.updateById(syncId, data, tx);

        return baseSecretSyncQuery({
          filter: { id: sync.id },
          db,
          tx
        }).first();
      }))!;

      // TODO (scott): replace with cached folder path once implemented
      const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(secretSync.projectId, [secretSync.folderId]);
      return expandSecretSync(secretSync, folderWithPath);
    } catch (error) {
      throw new DatabaseError({ error, name: "Update by ID - Secret Sync" });
    }
  };

  const findOne = async (filter: Parameters<(typeof secretSyncOrm)["findOne"]>[0], tx?: Knex) => {
    try {
      const secretSync = await baseSecretSyncQuery({ filter, db, tx }).first();

      if (secretSync) {
        // TODO (scott): replace with cached folder path once implemented
        const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(secretSync.projectId, [secretSync.folderId]);
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
        secretSyncs.map((sync) => sync.folderId)
      );

      // TODO (scott): replace with cached folder path once implemented
      const folderRecord: Record<string, (typeof foldersWithPath)[number]> = {};

      foldersWithPath.forEach((folder) => {
        if (folder) folderRecord[folder.id] = folder;
      });

      return secretSyncs.map((secretSync) => expandSecretSync(secretSync, folderRecord[secretSync.folderId]));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find - Secret Sync" });
    }
  };

  return { ...secretSyncOrm, findById, findOne, find, create, updateById };
};
