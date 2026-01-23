import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TAppConnections } from "@app/db/schemas/app-connections";
import { TableName } from "@app/db/schemas/models";
import { buildFindFilter, ormify, prependTableNameToFindFilter, selectAllTableCols } from "@app/lib/knex";
import { transformUsageToProjects } from "@app/services/app-connection/app-connection-fns";

export type TAppConnectionDALFactory = ReturnType<typeof appConnectionDALFactory>;

type AppConnectionFindFilter = Parameters<typeof buildFindFilter<TAppConnections>>[0];

export const appConnectionDALFactory = (db: TDbClient) => {
  const appConnectionOrm = ormify(db, TableName.AppConnection);

  const findWithProjectDetails = async (filter: AppConnectionFindFilter, tx?: Knex) => {
    const query = (tx || db.replicaNode())(TableName.AppConnection)
      .leftJoin(TableName.Project, `${TableName.AppConnection}.projectId`, `${TableName.Project}.id`)
      .select(selectAllTableCols(TableName.AppConnection))
      .select(
        // project
        db.ref("name").withSchema(TableName.Project).as("projectName"),
        db.ref("type").withSchema(TableName.Project).as("projectType"),
        db.ref("slug").withSchema(TableName.Project).as("projectSlug")
      );

    if (filter) {
      /* eslint-disable @typescript-eslint/no-misused-promises */
      void query.where(buildFindFilter(prependTableNameToFindFilter(TableName.AppConnection, filter)));
    }

    const connections = await query;

    return connections.map(({ projectName, projectSlug, projectType, projectId, ...connection }) => ({
      ...connection,
      projectId,
      project: projectId
        ? {
            name: projectName,
            type: projectType,
            slug: projectSlug,
            id: projectId
          }
        : null
    }));
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

  return { ...appConnectionOrm, findAppConnectionUsageById, findWithProjectDetails };
};
