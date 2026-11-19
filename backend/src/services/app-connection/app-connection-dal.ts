import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAppConnections, TAppConnectionsInsert } from "@app/db/schemas";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";
import { transformUsageToProjects } from "@app/services/app-connection/app-connection-fns";

import {
  fromStoredAppConnectionApp,
  getStoredAppConnectionAppValues,
  toStoredAppConnectionApp
} from "./app-connection-stored-app";
import { TAppConnection } from "./app-connection-types";
import { AppConnectionCredentialRotationStatus } from "./credential-rotation";
import { AppConnectionCredentialRotationRotateAtUtcSchema } from "./credential-rotation/app-connection-credential-rotation-schemas";

export type TAppConnectionDALFactory = ReturnType<typeof appConnectionDALFactory>;

type AppConnectionFindFilter = Parameters<typeof buildFindFilter<TAppConnections>>[0];

// Every query on app_connections goes through these, so the rest of the code only sees AppConnection values (see
// app-connection-stored-app.ts)
const withStoredAppFilter = <T extends AppConnectionFindFilter>(filter: T): T => {
  const { app, $in, ...rest } = filter;
  const apps = [...(app ? [app] : []), ...($in?.app ?? [])];
  if (!apps.length) return filter;

  return { ...rest, $in: { ...$in, app: apps.flatMap(getStoredAppConnectionAppValues) } } as T;
};

const withStoredApp = <T extends { app?: string }>(data: T): T =>
  data.app ? { ...data, app: toStoredAppConnectionApp(data.app) } : data;

const withApp = <T extends { app?: string } | undefined>(row: T): T =>
  row?.app ? { ...row, app: fromStoredAppConnectionApp(row.app) } : row;

export const appConnectionDALFactory = (db: TDbClient) => {
  const appConnectionOrm = ormify(db, TableName.AppConnection);

  const find = (async (filter, opts) => {
    const rows = await appConnectionOrm.find(withStoredAppFilter(filter), opts);
    return rows.map(withApp);
  }) as typeof appConnectionOrm.find;

  const findOne: typeof appConnectionOrm.findOne = async (filter, tx) => {
    if (!filter.app) return withApp(await appConnectionOrm.findOne(filter, tx));

    // findOne passes its filter straight to where(), which cannot match the legacy stored value as well
    const rows = await appConnectionOrm.find(withStoredAppFilter(filter), { limit: 1, tx });
    return rows.length ? withApp(rows[0]) : (undefined as unknown as TAppConnections);
  };

  const findWithProjectDetails = async (filter: AppConnectionFindFilter, tx?: Knex) => {
    const query = (tx || db.replicaNode())(TableName.AppConnection)
      .leftJoin(TableName.Project, `${TableName.AppConnection}.projectId`, `${TableName.Project}.id`)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .leftJoin(
        TableName.AppConnectionCredentialRotation,
        `${TableName.AppConnection}.id`,
        `${TableName.AppConnectionCredentialRotation}.connectionId`
      )
      .select(selectAllTableCols(TableName.AppConnection))
      .select(
        db.ref("rotationInterval").withSchema(TableName.AppConnectionCredentialRotation).as("rotationInterval"),
        db.ref("rotateAtUtc").withSchema(TableName.AppConnectionCredentialRotation).as("rotateAtUtc"),
        db.ref("rotationStatus").withSchema(TableName.AppConnectionCredentialRotation).as("rotationStatus"),
        db
          .ref("encryptedLastRotationMessage")
          .withSchema(TableName.AppConnectionCredentialRotation)
          .as("encryptedLastRotationMessage"),
        db.ref("nextRotationAt").withSchema(TableName.AppConnectionCredentialRotation).as("nextRotationAt")
      )
      .select(
        // project
        db.ref("name").withSchema(TableName.Project).as("projectName"),
        db.ref("type").withSchema(TableName.Project).as("projectType"),
        db.ref("slug").withSchema(TableName.Project).as("projectSlug")
      );

    if (filter) {
      /* eslint-disable @typescript-eslint/no-misused-promises */
      void query.where(
        buildFindFilter(prependTableNameToFindFilter(TableName.AppConnection, withStoredAppFilter(filter)))
      );
    }

    const connections = await query;

    return connections.map(({ projectName, projectSlug, projectType, projectId, ...connection }) => {
      let rotation:
        | (Omit<NonNullable<TAppConnection["rotation"]>, "lastRotationMessage"> & {
            encryptedLastRotationMessage?: Buffer | null;
          })
        | undefined
        | null;

      if (connection.rotateAtUtc) {
        const parsedRotationAtUtc = AppConnectionCredentialRotationRotateAtUtcSchema.safeParse(connection.rotateAtUtc);

        if (parsedRotationAtUtc.success) {
          rotation = {
            rotationInterval: connection.rotationInterval,
            nextRotationAt: connection.nextRotationAt,
            encryptedLastRotationMessage: connection.encryptedLastRotationMessage,
            rotationStatus: connection.rotationStatus as AppConnectionCredentialRotationStatus,
            rotateAtUtc: parsedRotationAtUtc.data
          };
        }
      }

      return {
        ...connection,
        app: fromStoredAppConnectionApp(connection.app),
        rotation,
        projectId,
        project: projectId
          ? {
              name: projectName,
              type: projectType,
              slug: projectSlug,
              id: projectId
            }
          : null
      };
    });
  };

  const findAppConnectionUsageById = async (connectionId: string, tx?: Knex) => {
    const secretSyncs = await (tx || db.replicaNode())(TableName.SecretSync)
      .where(`${TableName.SecretSync}.connectionId`, connectionId)
      .join(TableName.Project, `${TableName.SecretSync}.projectId`, `${TableName.Project}.id`)
      .select(
        db.ref("name").withSchema(TableName.SecretSync),
        db.ref("id").withSchema(TableName.SecretSync),
        db.ref("projectId").withSchema(TableName.SecretSync),
        db.ref("name").as("projectName").withSchema(TableName.Project),
        db.ref("slug").as("projectSlug").withSchema(TableName.Project),
        db.ref("type").as("projectType").withSchema(TableName.Project)
      );

    const secretRotations = await (tx || db.replicaNode())(TableName.SecretRotationV2)
      .where(`${TableName.SecretRotationV2}.connectionId`, connectionId)
      .join(TableName.SecretFolder, `${TableName.SecretRotationV2}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
      .select(
        db.ref("name").withSchema(TableName.SecretRotationV2),
        db.ref("id").withSchema(TableName.SecretRotationV2),
        db.ref("id").as("projectId").withSchema(TableName.Project),
        db.ref("name").as("projectName").withSchema(TableName.Project),
        db.ref("slug").as("projectSlug").withSchema(TableName.Project),
        db.ref("type").as("projectType").withSchema(TableName.Project)
      );

    const externalCas = await (tx || db.replicaNode())(TableName.ExternalCertificateAuthority)
      .where(`${TableName.ExternalCertificateAuthority}.appConnectionId`, connectionId)
      .orWhere(`${TableName.ExternalCertificateAuthority}.dnsAppConnectionId`, connectionId)
      .join(
        TableName.CertificateAuthority,
        `${TableName.ExternalCertificateAuthority}.caId`,
        `${TableName.CertificateAuthority}.id`
      )
      .join(TableName.Project, `${TableName.CertificateAuthority}.projectId`, `${TableName.Project}.id`)
      .select(
        db.ref("name").withSchema(TableName.CertificateAuthority),
        db.ref("id").withSchema(TableName.ExternalCertificateAuthority),
        db.ref("appConnectionId").withSchema(TableName.ExternalCertificateAuthority),
        db.ref("dnsAppConnectionId").withSchema(TableName.ExternalCertificateAuthority),
        db.ref("id").as("projectId").withSchema(TableName.Project),
        db.ref("name").as("projectName").withSchema(TableName.Project),
        db.ref("slug").as("projectSlug").withSchema(TableName.Project),
        db.ref("type").as("projectType").withSchema(TableName.Project)
      );

    const dataSources = await (tx || db.replicaNode())(TableName.SecretScanningDataSource)
      .where(`${TableName.SecretScanningDataSource}.connectionId`, connectionId)
      .join(TableName.Project, `${TableName.SecretScanningDataSource}.projectId`, `${TableName.Project}.id`)
      .select(
        db.ref("name").withSchema(TableName.SecretScanningDataSource),
        db.ref("id").withSchema(TableName.SecretScanningDataSource),
        db.ref("id").as("projectId").withSchema(TableName.Project),
        db.ref("name").as("projectName").withSchema(TableName.Project),
        db.ref("slug").as("projectSlug").withSchema(TableName.Project),
        db.ref("type").as("projectType").withSchema(TableName.Project)
      );

    return transformUsageToProjects({
      secretSyncs,
      secretRotations,
      dataSources,
      externalCas
    });
  };

  const findByGatewayId = async (gatewayId: string, tx?: Knex) => {
    const docs = await (tx || db.replicaNode())(TableName.AppConnection)
      .leftJoin(TableName.Project, `${TableName.AppConnection}.projectId`, `${TableName.Project}.id`)
      .where(`${TableName.AppConnection}.gatewayId`, gatewayId)
      .select(
        db.ref("id").withSchema(TableName.AppConnection),
        db.ref("name").withSchema(TableName.AppConnection),
        db.ref("app").withSchema(TableName.AppConnection),
        db.ref("projectId").withSchema(TableName.AppConnection),
        db.ref("name").withSchema(TableName.Project).as("projectName")
      );

    return docs.map(withApp);
  };

  const countByGatewayId = async (gatewayId: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.AppConnection)
      .where(`${TableName.AppConnection}.gatewayId`, gatewayId)
      .count("id")
      .first();

    return parseInt(String(result?.count || "0"), 10);
  };

  const findByGatewayPoolId = async (gatewayPoolId: string, tx?: Knex) => {
    const docs = await (tx || db.replicaNode())(TableName.AppConnection)
      .leftJoin(TableName.Project, `${TableName.AppConnection}.projectId`, `${TableName.Project}.id`)
      .where(`${TableName.AppConnection}.gatewayPoolId`, gatewayPoolId)
      .select(
        db.ref("id").withSchema(TableName.AppConnection),
        db.ref("name").withSchema(TableName.AppConnection),
        db.ref("app").withSchema(TableName.AppConnection),
        db.ref("projectId").withSchema(TableName.AppConnection),
        db.ref("name").withSchema(TableName.Project).as("projectName")
      );

    return docs.map(withApp);
  };

  const countByGatewayPoolId = async (gatewayPoolId: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.AppConnection)
      .where(`${TableName.AppConnection}.gatewayPoolId`, gatewayPoolId)
      .count("id")
      .first();

    return parseInt(String(result?.count || "0"), 10);
  };

  return {
    ...appConnectionOrm,
    findById: async (id: string, tx?: Knex) => withApp(await appConnectionOrm.findById(id, tx)),
    find,
    findOne,
    create: async (data: TAppConnectionsInsert, tx?: Knex) =>
      withApp(await appConnectionOrm.create(withStoredApp(data), tx)),
    insertMany: async (data: readonly TAppConnectionsInsert[], tx?: Knex) =>
      (await appConnectionOrm.insertMany(data.map(withStoredApp), tx)).map(withApp),
    batchInsert: async (data: readonly TAppConnectionsInsert[], tx?: Knex) =>
      (await appConnectionOrm.batchInsert(data.map(withStoredApp), tx)).map(withApp),
    upsert: (async (data, ...args) =>
      (await appConnectionOrm.upsert(data.map(withStoredApp), ...args)).map(withApp)) as typeof appConnectionOrm.upsert,
    updateById: (async (id, data, tx) =>
      withApp(await appConnectionOrm.updateById(id, withStoredApp(data), tx))) as typeof appConnectionOrm.updateById,
    update: (async (filter, data, tx) =>
      (await appConnectionOrm.update(withStoredAppFilter(filter), withStoredApp(data), tx)).map(
        withApp
      )) as typeof appConnectionOrm.update,
    deleteById: async (id: string, tx?: Knex) => withApp(await appConnectionOrm.deleteById(id, tx)),
    delete: async (filter: AppConnectionFindFilter, tx?: Knex) =>
      (await appConnectionOrm.delete(withStoredAppFilter(filter), tx)).map(withApp),
    findAppConnectionUsageById,
    findWithProjectDetails,
    findByGatewayId,
    countByGatewayId,
    findByGatewayPoolId,
    countByGatewayPoolId
  };
};
