import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiSyncs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";
import { applyPermissionFiltersToQuery, type PermissionFilters } from "@app/lib/knex/permission-filter-utils";

import { PkiSync } from "./pki-sync-enums";

export type TPkiSyncDALFactory = ReturnType<typeof pkiSyncDALFactory>;

type PkiSyncFindFilter = Parameters<typeof buildFindFilter<TPkiSyncs>>[0];

const basePkiSyncQuery = ({ filter, db, tx }: { db: TDbClient; filter?: PkiSyncFindFilter; tx?: Knex }) => {
  const query = (tx || db.replicaNode())(TableName.PkiSync)
    .leftJoin(TableName.AppConnection, `${TableName.PkiSync}.connectionId`, `${TableName.AppConnection}.id`)
    .select(selectAllTableCols(TableName.PkiSync))
    .select(
      // app connection fields
      db.ref("name").withSchema(TableName.AppConnection).as("appConnectionName"),
      db.ref("app").withSchema(TableName.AppConnection).as("appConnectionApp"),
      db.ref("encryptedCredentials").withSchema(TableName.AppConnection).as("appConnectionEncryptedCredentials"),
      db.ref("orgId").withSchema(TableName.AppConnection).as("appConnectionOrgId"),
      db.ref("projectId").withSchema(TableName.AppConnection).as("appConnectionProjectId"),
      db.ref("method").withSchema(TableName.AppConnection).as("appConnectionMethod"),
      db.ref("description").withSchema(TableName.AppConnection).as("appConnectionDescription"),
      db.ref("version").withSchema(TableName.AppConnection).as("appConnectionVersion"),
      db.ref("gatewayId").withSchema(TableName.AppConnection).as("appConnectionGatewayId"),
      db.ref("createdAt").withSchema(TableName.AppConnection).as("appConnectionCreatedAt"),
      db.ref("updatedAt").withSchema(TableName.AppConnection).as("appConnectionUpdatedAt"),
      db
        .ref("isPlatformManagedCredentials")
        .withSchema(TableName.AppConnection)
        .as("appConnectionIsPlatformManagedCredentials")
    );

  if (filter) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    void query.where(buildFindFilter(prependTableNameToFindFilter(TableName.PkiSync, filter)));
  }

  return query;
};

const basePkiSyncWithSubscriberQuery = ({
  filter,
  db,
  tx,
  permissionFilters
}: {
  db: TDbClient;
  filter?: PkiSyncFindFilter;
  tx?: Knex;
  permissionFilters?: PermissionFilters;
}) => {
  let query = (tx || db.replicaNode())(TableName.PkiSync)
    .leftJoin(TableName.AppConnection, `${TableName.PkiSync}.connectionId`, `${TableName.AppConnection}.id`)
    .leftJoin(TableName.PkiSubscriber, `${TableName.PkiSync}.subscriberId`, `${TableName.PkiSubscriber}.id`)
    .select(selectAllTableCols(TableName.PkiSync))
    .select(
      // app connection fields
      db.ref("name").withSchema(TableName.AppConnection).as("appConnectionName"),
      db.ref("app").withSchema(TableName.AppConnection).as("appConnectionApp"),
      db.ref("encryptedCredentials").withSchema(TableName.AppConnection).as("appConnectionEncryptedCredentials"),
      db.ref("orgId").withSchema(TableName.AppConnection).as("appConnectionOrgId"),
      db.ref("projectId").withSchema(TableName.AppConnection).as("appConnectionProjectId"),
      db.ref("method").withSchema(TableName.AppConnection).as("appConnectionMethod"),
      db.ref("description").withSchema(TableName.AppConnection).as("appConnectionDescription"),
      db.ref("version").withSchema(TableName.AppConnection).as("appConnectionVersion"),
      db.ref("gatewayId").withSchema(TableName.AppConnection).as("appConnectionGatewayId"),
      db.ref("createdAt").withSchema(TableName.AppConnection).as("appConnectionCreatedAt"),
      db.ref("updatedAt").withSchema(TableName.AppConnection).as("appConnectionUpdatedAt"),
      db
        .ref("isPlatformManagedCredentials")
        .withSchema(TableName.AppConnection)
        .as("appConnectionIsPlatformManagedCredentials"),
      // pki subscriber fields
      db.ref("id").withSchema(TableName.PkiSubscriber).as("pkiSubscriberId"),
      db.ref("name").withSchema(TableName.PkiSubscriber).as("subscriberName")
    );

  if (filter) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    void query.where(buildFindFilter(prependTableNameToFindFilter(TableName.PkiSync, filter)));
  }

  if (permissionFilters) {
    query = applyPermissionFiltersToQuery(query, TableName.PkiSync, permissionFilters) as typeof query;
  }

  return query;
};

const expandPkiSync = (pkiSync: Awaited<ReturnType<typeof basePkiSyncQuery>>[number]) => {
  const {
    appConnectionName,
    appConnectionApp,
    appConnectionEncryptedCredentials,
    appConnectionOrgId,
    appConnectionProjectId,
    appConnectionMethod,
    appConnectionDescription,
    appConnectionVersion,
    appConnectionGatewayId,
    appConnectionCreatedAt,
    appConnectionUpdatedAt,
    appConnectionIsPlatformManagedCredentials,
    ...el
  } = pkiSync;

  return {
    ...el,
    destination: el.destination as PkiSync,
    destinationConfig: el.destinationConfig as Record<string, unknown>,
    syncOptions: el.syncOptions as Record<string, unknown>,
    appConnectionName,
    appConnectionApp,
    connection: {
      id: el.connectionId,
      name: appConnectionName,
      app: appConnectionApp,
      encryptedCredentials: appConnectionEncryptedCredentials,
      orgId: appConnectionOrgId,
      projectId: appConnectionProjectId,
      method: appConnectionMethod,
      description: appConnectionDescription,
      version: appConnectionVersion,
      gatewayId: appConnectionGatewayId,
      createdAt: appConnectionCreatedAt,
      updatedAt: appConnectionUpdatedAt,
      isPlatformManagedCredentials: appConnectionIsPlatformManagedCredentials
    }
  };
};

const expandPkiSyncWithSubscriber = (pkiSync: Awaited<ReturnType<typeof basePkiSyncWithSubscriberQuery>>[number]) => {
  const {
    appConnectionName,
    appConnectionApp,
    appConnectionEncryptedCredentials,
    appConnectionOrgId,
    appConnectionProjectId,
    appConnectionMethod,
    appConnectionDescription,
    appConnectionVersion,
    appConnectionGatewayId,
    appConnectionCreatedAt,
    appConnectionUpdatedAt,
    appConnectionIsPlatformManagedCredentials,
    pkiSubscriberId,
    subscriberName,
    ...el
  } = pkiSync;

  return {
    ...el,
    destination: el.destination as PkiSync,
    destinationConfig: el.destinationConfig as Record<string, unknown>,
    syncOptions: el.syncOptions as Record<string, unknown>,
    appConnectionName,
    appConnectionApp,
    connection: {
      id: el.connectionId,
      name: appConnectionName,
      app: appConnectionApp,
      encryptedCredentials: appConnectionEncryptedCredentials,
      orgId: appConnectionOrgId,
      projectId: appConnectionProjectId,
      method: appConnectionMethod,
      description: appConnectionDescription,
      version: appConnectionVersion,
      gatewayId: appConnectionGatewayId,
      createdAt: appConnectionCreatedAt,
      updatedAt: appConnectionUpdatedAt,
      isPlatformManagedCredentials: appConnectionIsPlatformManagedCredentials
    },
    subscriber: pkiSubscriberId && subscriberName ? { id: pkiSubscriberId, name: subscriberName } : null
  };
};

export const pkiSyncDALFactory = (db: TDbClient) => {
  const pkiSyncOrm = ormify(db, TableName.PkiSync);

  const findByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const pkiSyncs = await basePkiSyncQuery({ filter: { projectId }, db, tx });
      return pkiSyncs.map(expandPkiSync);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By Project ID - PKI Sync" });
    }
  };

  const findByProjectIdWithSubscribers = async (
    projectId: string,
    permissionFilters?: PermissionFilters,
    tx?: Knex
  ) => {
    try {
      const pkiSyncs = await basePkiSyncWithSubscriberQuery({
        filter: { projectId },
        db,
        tx,
        permissionFilters
      });
      return pkiSyncs.map(expandPkiSyncWithSubscriber);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By Project ID With Subscribers - PKI Sync" });
    }
  };

  const findBySubscriberId = async (subscriberId: string, tx?: Knex) => {
    try {
      const pkiSyncs = await basePkiSyncQuery({ filter: { subscriberId }, db, tx });
      return pkiSyncs.map(expandPkiSync);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By Subscriber ID - PKI Sync" });
    }
  };

  const findByIdAndProjectId = async (id: string, projectId: string, tx?: Knex) => {
    try {
      const pkiSync = await basePkiSyncQuery({ filter: { id, projectId }, db, tx }).first();
      return pkiSync ? expandPkiSync(pkiSync) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By ID and Project ID - PKI Sync" });
    }
  };

  const findByNameAndProjectId = async (name: string, projectId: string, tx?: Knex) => {
    try {
      const pkiSync = await basePkiSyncQuery({ filter: { name, projectId }, db, tx }).first();
      return pkiSync ? expandPkiSync(pkiSync) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By Name and Project ID - PKI Sync" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const pkiSync = await basePkiSyncQuery({ filter: { id }, db, tx }).first();
      return pkiSync ? expandPkiSync(pkiSync) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find By ID - PKI Sync" });
    }
  };

  const findOne = async (filter: Parameters<(typeof pkiSyncOrm)["findOne"]>[0], tx?: Knex) => {
    try {
      const pkiSync = await basePkiSyncQuery({ filter, db, tx }).first();
      return pkiSync ? expandPkiSync(pkiSync) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find One - PKI Sync" });
    }
  };

  const find = async (filter: Parameters<(typeof pkiSyncOrm)["find"]>[0], tx?: Knex) => {
    try {
      const pkiSyncs = await basePkiSyncQuery({ filter, db, tx });
      return pkiSyncs.map(expandPkiSync);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find - PKI Sync" });
    }
  };

  const create = async (data: Parameters<(typeof pkiSyncOrm)["create"]>[0]) => {
    const pkiSync = (await pkiSyncOrm.transaction(async (tx) => {
      const sync = await pkiSyncOrm.create(data, tx);
      return basePkiSyncQuery({ filter: { id: sync.id }, db, tx }).first();
    }))!;

    return expandPkiSync(pkiSync);
  };

  const updateById = async (syncId: string, data: Parameters<(typeof pkiSyncOrm)["updateById"]>[1]) => {
    const pkiSync = (await pkiSyncOrm.transaction(async (tx) => {
      const sync = await pkiSyncOrm.updateById(syncId, data, tx);
      return basePkiSyncQuery({ filter: { id: sync.id }, db, tx }).first();
    }))!;

    return expandPkiSync(pkiSync);
  };

  const findPkiSyncsWithExpiredCertificates = async (): Promise<Array<{ id: string; subscriberId: string }>> => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const pkiSyncs = (await db
        .replicaNode()(TableName.PkiSync)
        .select(`${TableName.PkiSync}.id`, `${TableName.PkiSync}.subscriberId`)
        .innerJoin(
          TableName.Certificate,
          `${TableName.PkiSync}.subscriberId`,
          `${TableName.Certificate}.pkiSubscriberId`
        )
        .where(`${TableName.Certificate}.notAfter`, ">=", yesterday)
        .where(`${TableName.Certificate}.notAfter`, "<", today)
        .whereNotNull(`${TableName.Certificate}.pkiSubscriberId`)
        .whereNotNull(`${TableName.PkiSync}.subscriberId`)
        .groupBy(`${TableName.PkiSync}.id`, `${TableName.PkiSync}.subscriberId`)) as Array<{
        id: string;
        subscriberId: string;
      }>;

      return pkiSyncs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI syncs with expired certificates" });
    }
  };

  return {
    ...pkiSyncOrm,
    findByProjectId,
    findByProjectIdWithSubscribers,
    findBySubscriberId,
    findByIdAndProjectId,
    findByNameAndProjectId,
    findById,
    findOne,
    find,
    create,
    updateById,
    findPkiSyncsWithExpiredCertificates
  };
};
