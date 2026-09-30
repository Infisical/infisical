import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { CertStatus } from "@app/services/certificate/certificate-types";

export type TCertManagerApplicationAlertDALFactory = ReturnType<typeof certManagerApplicationAlertDALFactory>;

export type TApplicationAlertCertificate = {
  id: string;
  serialNumber: string;
  commonName: string;
  altNames: string | null;
  profileName: string | null;
  notAfter: Date;
  revocationReason: number | null;
  applicationName: string | null;
};

type TCertificateScope = {
  projectId: string;
  applicationId: string;
};

const MAX_EXPIRING_CERTIFICATES_PER_RUN = 1000;

export const certManagerApplicationAlertDALFactory = (db: TDbClient) => {
  const $selectCertificates = (reader: Knex, { projectId, applicationId }: TCertificateScope) =>
    reader(TableName.Certificate)
      .leftJoin(`${TableName.PkiCertificateProfile} as profile`, `${TableName.Certificate}.profileId`, "profile.id")
      .leftJoin(TableName.PkiApplication, `${TableName.Certificate}.applicationId`, `${TableName.PkiApplication}.id`)
      .where(`${TableName.Certificate}.projectId`, projectId)
      .where(`${TableName.Certificate}.applicationId`, applicationId)
      .select(
        `${TableName.Certificate}.id`,
        `${TableName.Certificate}.serialNumber`,
        `${TableName.Certificate}.commonName`,
        `${TableName.Certificate}.altNames`,
        `${TableName.Certificate}.notAfter`,
        `${TableName.Certificate}.revocationReason`,
        "profile.slug as profileName",
        `${TableName.PkiApplication}.name as applicationName`
      );

  const findExpiringCertificates = async (
    scope: TCertificateScope & { alertBeforeInterval: string; leadInterval: string; asOf: Date },
    tx?: Knex
  ): Promise<TApplicationAlertCertificate[]> => {
    try {
      const certificates = (await $selectCertificates(tx || db.replicaNode(), scope)
        .whereNot(`${TableName.Certificate}.status`, CertStatus.REVOKED)
        .whereNull(`${TableName.Certificate}.renewedByCertificateId`)
        .whereRaw(`"${TableName.Certificate}"."notAfter" > ?::timestamptz`, [scope.asOf])
        .whereRaw(`"${TableName.Certificate}"."notAfter" <= ?::timestamptz + ?::interval + ?::interval`, [
          scope.asOf,
          scope.alertBeforeInterval,
          scope.leadInterval
        ])
        .orderBy(`${TableName.Certificate}.notAfter`, "asc")
        .limit(MAX_EXPIRING_CERTIFICATES_PER_RUN)) as TApplicationAlertCertificate[];

      return certificates;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindExpiringCertificates" });
    }
  };

  const findCertificatesByIds = async (
    scope: TCertificateScope & { certificateIds: string[] },
    tx?: Knex
  ): Promise<TApplicationAlertCertificate[]> => {
    try {
      const certificates = (await $selectCertificates(tx || db, scope).whereIn(
        `${TableName.Certificate}.id`,
        scope.certificateIds
      )) as TApplicationAlertCertificate[];

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

  return {
    findExpiringCertificates,
    findCertificatesByIds,
    findApplicationById,
    findApplicationNamesByIds
  };
};
