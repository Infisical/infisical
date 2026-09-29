import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { AlertRunStatus, TAlreadyAlertedFilter } from "@app/services/alert/alert-types";
import { CertStatus } from "@app/services/certificate/certificate-types";

export type TCertManagerCertificateAlertDALFactory = ReturnType<typeof certManagerCertificateAlertDALFactory>;

export type TAlertCertificate = {
  id: string;
  serialNumber: string;
  commonName: string;
  altNames: string | null;
  profileName: string | null;
  notAfter: Date;
  revocationReason: number | null;
  applicationName: string | null;
};

export type TActiveCertificate = {
  id: string;
  serialNumber: string;
  commonName: string;
  altNames: string | null;
  profileId: string | null;
  pkiSubscriberId: string | null;
  profileName: string | null;
  notBefore: Date;
  notAfter: Date;
  status: string;
};

type TCertificateScope = {
  projectId: string;
  applicationId?: string | null;
  applicationIds?: string[];
  profileIds?: string[];
};

const MAX_EXPIRING_CERTIFICATES_PER_RUN = 1000;

export const certManagerCertificateAlertDALFactory = (db: TDbClient) => {
  const $selectCertificates = (
    reader: Knex,
    { projectId, applicationId, applicationIds, profileIds }: TCertificateScope
  ) => {
    const query = reader(TableName.Certificate)
      .leftJoin(`${TableName.PkiCertificateProfile} as profile`, `${TableName.Certificate}.profileId`, "profile.id")
      .leftJoin(TableName.PkiApplication, `${TableName.Certificate}.applicationId`, `${TableName.PkiApplication}.id`)
      .where(`${TableName.Certificate}.projectId`, projectId);

    if (applicationId) void query.where(`${TableName.Certificate}.applicationId`, applicationId);
    if (applicationIds?.length) void query.whereIn(`${TableName.Certificate}.applicationId`, applicationIds);
    if (profileIds?.length) void query.whereIn(`${TableName.Certificate}.profileId`, profileIds);

    return query.select(
      `${TableName.Certificate}.id`,
      `${TableName.Certificate}.serialNumber`,
      `${TableName.Certificate}.commonName`,
      `${TableName.Certificate}.altNames`,
      `${TableName.Certificate}.notAfter`,
      `${TableName.Certificate}.revocationReason`,
      "profile.slug as profileName",
      `${TableName.PkiApplication}.name as applicationName`
    );
  };

  const findExpiringCertificates = async (
    scope: TCertificateScope & {
      alertBeforeInterval: string;
      leadInterval: string;
      asOf: Date;
      alreadyAlerted?: TAlreadyAlertedFilter;
    },
    tx?: Knex
  ): Promise<TAlertCertificate[]> => {
    try {
      const query = $selectCertificates(tx || db.replicaNode(), scope);
      const { alreadyAlerted } = scope;
      if (alreadyAlerted?.channelIds.length) {
        void query.whereRaw(
          `(SELECT COUNT(DISTINCT tgt."channelId") FROM ?? AS hist JOIN ?? AS tgt ON tgt."alertHistoryId" = hist.id
            WHERE hist."alertId" = ? AND hist."triggeredAt" >= ? AND tgt.status = ?
              AND tgt."channelId" = ANY(?::uuid[]) AND tgt."targetId" = ??::text) < ?`,
          [
            TableName.AlertHistory,
            TableName.AlertHistoryTarget,
            alreadyAlerted.alertId,
            alreadyAlerted.since,
            AlertRunStatus.SUCCESS,
            alreadyAlerted.channelIds,
            `${TableName.Certificate}.id`,
            alreadyAlerted.channelIds.length
          ]
        );
      }

      const certificates = (await query
        .whereNot(`${TableName.Certificate}.status`, CertStatus.REVOKED)
        .whereNull(`${TableName.Certificate}.renewedByCertificateId`)
        .whereRaw(`"${TableName.Certificate}"."notAfter" > ?::timestamptz`, [scope.asOf])
        .whereRaw(`"${TableName.Certificate}"."notAfter" <= ?::timestamptz + ?::interval + ?::interval`, [
          scope.asOf,
          scope.alertBeforeInterval,
          scope.leadInterval
        ])
        .orderBy(`${TableName.Certificate}.notAfter`, "asc")
        .limit(MAX_EXPIRING_CERTIFICATES_PER_RUN)) as TAlertCertificate[];

      return certificates;
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

  const listActiveCertificates = async (
    scope: {
      projectId: string;
      applicationId: string;
      limit: number;
      offset: number;
      excludeAlertedByAlertId?: string;
    },
    tx?: Knex
  ): Promise<{ certificates: TActiveCertificate[]; total: number }> => {
    try {
      const reader = tx || db.replicaNode();
      const query = reader(TableName.Certificate)
        .where(`${TableName.Certificate}.projectId`, scope.projectId)
        .where(`${TableName.Certificate}.applicationId`, scope.applicationId)
        .whereNot(`${TableName.Certificate}.status`, CertStatus.REVOKED)
        .whereNull(`${TableName.Certificate}.renewedByCertificateId`)
        .whereRaw(`"${TableName.Certificate}"."notAfter" > NOW()`);

      if (scope.excludeAlertedByAlertId) {
        void query.whereNotExists(
          reader(TableName.AlertHistory)
            .join(
              TableName.AlertHistoryTarget,
              `${TableName.AlertHistory}.id`,
              `${TableName.AlertHistoryTarget}.alertHistoryId`
            )
            .where(`${TableName.AlertHistory}.alertId`, scope.excludeAlertedByAlertId)
            .where(`${TableName.AlertHistoryTarget}.status`, AlertRunStatus.SUCCESS)
            .whereRaw(`"${TableName.AlertHistoryTarget}"."targetId" = "${TableName.Certificate}".id::text`)
            .select(reader.raw("1"))
        );
      }

      const [countResult, certificates] = await Promise.all([
        query.clone().count("* as count").first(),
        query
          .clone()
          .leftJoin(`${TableName.PkiCertificateProfile} as profile`, `${TableName.Certificate}.profileId`, "profile.id")
          .select(
            `${TableName.Certificate}.id`,
            `${TableName.Certificate}.serialNumber`,
            `${TableName.Certificate}.commonName`,
            `${TableName.Certificate}.altNames`,
            `${TableName.Certificate}.profileId`,
            `${TableName.Certificate}.pkiSubscriberId`,
            `${TableName.Certificate}.notBefore`,
            `${TableName.Certificate}.notAfter`,
            `${TableName.Certificate}.status`,
            "profile.slug as profileName"
          )
          .orderBy(`${TableName.Certificate}.notAfter`, "asc")
          .limit(scope.limit)
          .offset(scope.offset)
      ]);

      return {
        certificates: certificates as TActiveCertificate[],
        total: parseInt(String((countResult as { count: string | number } | undefined)?.count ?? 0), 10)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "ListActiveCertificates" });
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

  const findProjectApplicationIds = async (projectId: string, applicationIds: string[], tx?: Knex) => {
    try {
      return (await (tx || db.replicaNode())(TableName.PkiApplication)
        .where({ projectId })
        .whereIn("id", applicationIds)
        .pluck("id")) as string[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindProjectApplicationIds" });
    }
  };

  const findProjectProfileIds = async (projectId: string, profileIds: string[], tx?: Knex) => {
    try {
      return (await (tx || db.replicaNode())(TableName.PkiCertificateProfile)
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
    listActiveCertificates,
    findApplicationById,
    findApplicationNamesByIds,
    findProjectApplicationIds,
    findProjectProfileIds
  };
};
