import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { CertificateSource } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { DatabaseError } from "@app/lib/errors";

import { scanExpiringCertificates, TExpiringCertificatesScan } from "./cert-manager-expiring-certificates-fns";

export type TCertManagerCertificateAlertDALFactory = ReturnType<typeof certManagerCertificateAlertDALFactory>;

export type TAlertCertificate = {
  id: string;
  serialNumber: string;
  commonName: string;
  altNames: string | null;
  profileId: string | null;
  profileName: string | null;
  status: string;
  notBefore: Date;
  notAfter: Date;
  revokedAt: Date | null;
  revocationReason: number | null;
  applicationId: string | null;
  applicationName: string | null;
};

type TCertificateScope = {
  projectId: string;
  applicationId?: string | null;
  applicationIds?: string[];
  profileIds?: string[];
  sources?: CertificateSource[];
};

export const certManagerCertificateAlertDALFactory = (db: TDbClient) => {
  const $selectCertificates = (
    reader: Knex,
    { projectId, applicationId, applicationIds, profileIds, sources }: TCertificateScope
  ) =>
    reader(TableName.Certificate)
      .leftJoin(`${TableName.PkiCertificateProfile} as profile`, `${TableName.Certificate}.profileId`, "profile.id")
      .leftJoin(TableName.PkiApplication, `${TableName.Certificate}.applicationId`, `${TableName.PkiApplication}.id`)
      .where(`${TableName.Certificate}.projectId`, projectId)
      .modify((query) => {
        if (applicationId) void query.where(`${TableName.Certificate}.applicationId`, applicationId);
        if (applicationIds?.length) void query.whereIn(`${TableName.Certificate}.applicationId`, applicationIds);
        if (profileIds?.length) void query.whereIn(`${TableName.Certificate}.profileId`, profileIds);
        if (sources?.length) {
          void query.where((qb) => {
            void qb.whereIn(`${TableName.Certificate}.source`, sources);
            if (sources.includes(CertificateSource.Issued)) void qb.orWhereNull(`${TableName.Certificate}.source`);
          });
        }
      })
      .select(
        `${TableName.Certificate}.id`,
        `${TableName.Certificate}.serialNumber`,
        `${TableName.Certificate}.commonName`,
        `${TableName.Certificate}.altNames`,
        `${TableName.Certificate}.status`,
        `${TableName.Certificate}.notBefore`,
        `${TableName.Certificate}.notAfter`,
        `${TableName.Certificate}.revokedAt`,
        `${TableName.Certificate}.revocationReason`,
        `${TableName.Certificate}.applicationId`,
        `${TableName.Certificate}.profileId`,
        "profile.slug as profileName",
        `${TableName.PkiApplication}.name as applicationName`
      );

  const findExpiringCertificates = async (
    scope: TCertificateScope & TExpiringCertificatesScan,
    tx?: Knex
  ): Promise<TAlertCertificate[]> => {
    try {
      const reader = tx || db.replicaNode();
      return await scanExpiringCertificates<TAlertCertificate>(
        reader,
        () => $selectCertificates(reader, scope).whereNull(`${TableName.Certificate}.renewedByCertificateId`),
        scope
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindExpiringCertificates" });
    }
  };

  const findCertificatesByIds = async (
    scope: TCertificateScope & { certificateIds: string[] },
    tx?: Knex
  ): Promise<TAlertCertificate[]> => {
    try {
      const certificates = (await $selectCertificates(tx || db, scope).whereIn(
        `${TableName.Certificate}.id`,
        scope.certificateIds
      )) as TAlertCertificate[];

      return certificates;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindCertificatesByIds" });
    }
  };

  const findApplicationById = async (
    applicationId: string,
    tx?: Knex
  ): Promise<{ id: string; name: string; projectId: string; orgId: string } | undefined> => {
    try {
      const application = (await (tx || db.replicaNode())(TableName.PkiApplication)
        .join(TableName.Project, `${TableName.PkiApplication}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.PkiApplication}.id`, applicationId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(
          `${TableName.PkiApplication}.id`,
          `${TableName.PkiApplication}.name`,
          `${TableName.PkiApplication}.projectId`,
          `${TableName.Project}.orgId`
        )
        .first()) as { id: string; name: string; projectId: string; orgId: string } | undefined;

      return application;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindApplicationById" });
    }
  };

  const findApplicationNamesByIds = async (
    applicationIds: string[],
    orgId: string,
    tx?: Knex
  ): Promise<{ id: string; name: string }[]> => {
    if (applicationIds.length === 0) return [];
    try {
      const applications = (await (tx || db.replicaNode())(TableName.PkiApplication)
        .join(TableName.Project, `${TableName.PkiApplication}.projectId`, `${TableName.Project}.id`)
        .whereIn(`${TableName.PkiApplication}.id`, applicationIds)
        .where(`${TableName.Project}.orgId`, orgId)
        .select(`${TableName.PkiApplication}.id`, `${TableName.PkiApplication}.name`)) as {
        id: string;
        name: string;
      }[];

      return applications;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindApplicationNamesByIds" });
    }
  };

  const findProfileNamesByIds = async (projectId: string, profileIds: string[]) => {
    if (profileIds.length === 0) return [];
    try {
      return (await db
        .replicaNode()(TableName.PkiCertificateProfile)
        .where({ projectId })
        .whereIn("id", profileIds)
        .select("id", "slug as name")) as { id: string; name: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindProfileNamesByIds" });
    }
  };

  const findProjectApplicationIds = async (projectId: string, applicationIds: string[], tx?: Knex) => {
    try {
      return (await (tx || db)(TableName.PkiApplication)
        .where({ projectId })
        .whereIn("id", applicationIds)
        .pluck("id")) as string[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindProjectApplicationIds" });
    }
  };

  const findProjectProfileIds = async (projectId: string, profileIds: string[], tx?: Knex) => {
    try {
      return (await (tx || db)(TableName.PkiCertificateProfile)
        .where({ projectId })
        .whereIn("id", profileIds)
        .pluck("id")) as string[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindProjectProfileIds" });
    }
  };

  return {
    findExpiringCertificates,
    findCertificatesByIds,
    findApplicationById,
    findApplicationNamesByIds,
    findProfileNamesByIds,
    findProjectApplicationIds,
    findProjectProfileIds
  };
};
