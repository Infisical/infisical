import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { AlertRunStatus, TAlreadyAlertedFilter } from "@app/services/alert/alert-types";
import { CertStatus } from "@app/services/certificate/certificate-types";

export type TCertManagerApplicationAlertDALFactory = ReturnType<typeof certManagerApplicationAlertDALFactory>;

export type TApplicationAlertCertificate = {
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

type TExpiryWindow = {
  alertBeforeInterval: string;
  leadInterval: string;
  asOf: Date;
  alreadyAlerted: TAlreadyAlertedFilter;
};

type TCertificateScope = {
  projectId: string;
  applicationId?: string | null;
  applicationIds?: string[];
  profileIds?: string[];
};

const MAX_EXPIRING_CERTIFICATES_PER_RUN = 1000;

export const certManagerApplicationAlertDALFactory = (db: TDbClient) => {
  const $selectCertificates = (
    reader: Knex,
    { projectId, applicationId, applicationIds, profileIds }: TCertificateScope
  ) =>
    reader(TableName.Certificate)
      .leftJoin(`${TableName.PkiCertificateProfile} as profile`, `${TableName.Certificate}.profileId`, "profile.id")
      .leftJoin(TableName.PkiApplication, `${TableName.Certificate}.applicationId`, `${TableName.PkiApplication}.id`)
      .where(`${TableName.Certificate}.projectId`, projectId)
      .modify((query) => {
        if (applicationId) void query.where(`${TableName.Certificate}.applicationId`, applicationId);
        if (applicationIds?.length) void query.whereIn(`${TableName.Certificate}.applicationId`, applicationIds);
        if (profileIds?.length) void query.whereIn(`${TableName.Certificate}.profileId`, profileIds);
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
    scope: TCertificateScope & TExpiryWindow,
    tx?: Knex
  ): Promise<TApplicationAlertCertificate[]> => {
    try {
      const reader = tx || db.replicaNode();
      const { alertId, channelIds, since } = scope.alreadyAlerted;

      const deliveredOnEveryChannel = reader(`${TableName.AlertHistory} as deliveredHist`)
        .join(`${TableName.AlertHistoryTarget} as deliveredTgt`, "deliveredHist.id", "deliveredTgt.alertHistoryId")
        .where("deliveredHist.alertId", alertId)
        .where("deliveredTgt.status", AlertRunStatus.SUCCESS)
        .whereIn("deliveredTgt.channelId", channelIds)
        .groupBy("deliveredTgt.targetId")
        .havingRaw(`count(distinct "deliveredTgt"."channelId") >= ?`, [channelIds.length]);

      const notFullyNotified = (await $selectCertificates(reader, scope)
        .whereNull(`${TableName.Certificate}.renewedByCertificateId`)
        .whereNot(`${TableName.Certificate}.status`, CertStatus.REVOKED)
        .whereRaw(`"${TableName.Certificate}"."notAfter" > ?::timestamptz`, [scope.asOf])
        .whereRaw(`"${TableName.Certificate}"."notAfter" <= ?::timestamptz + ?::interval + ?::interval`, [
          scope.asOf,
          scope.alertBeforeInterval,
          scope.leadInterval
        ])
        .whereRaw(`"${TableName.Certificate}".id::text not in (?)`, [
          deliveredOnEveryChannel.clone().select("deliveredTgt.targetId")
        ])
        .orderBy(`${TableName.Certificate}.notAfter`, "asc")
        .limit(MAX_EXPIRING_CERTIFICATES_PER_RUN)) as TApplicationAlertCertificate[];
      if (notFullyNotified.length >= MAX_EXPIRING_CERTIFICATES_PER_RUN) return notFullyNotified;

      const deliveredChannelCountSince = reader(`${TableName.AlertHistory} as hist`)
        .join(`${TableName.AlertHistoryTarget} as tgt`, "hist.id", "tgt.alertHistoryId")
        .where("hist.alertId", alertId)
        .where("hist.triggeredAt", ">=", since)
        .where("tgt.status", AlertRunStatus.SUCCESS)
        .whereIn("tgt.channelId", channelIds)
        .whereRaw(`"tgt"."targetId" = "${TableName.Certificate}".id::text`)
        .countDistinct("tgt.channelId");
      const leastRecentlyNotified = (await $selectCertificates(reader, scope)
        .joinRaw(
          `inner join (?) as "lastDelivered" on "lastDelivered"."targetId" = "${TableName.Certificate}".id::text`,
          [
            deliveredOnEveryChannel
              .clone()
              .select("deliveredTgt.targetId")
              .max("deliveredHist.triggeredAt as lastDeliveredAt")
          ]
        )
        .whereNull(`${TableName.Certificate}.renewedByCertificateId`)
        .whereNot(`${TableName.Certificate}.status`, CertStatus.REVOKED)
        .whereRaw(`"${TableName.Certificate}"."notAfter" > ?::timestamptz`, [scope.asOf])
        .whereRaw(`"${TableName.Certificate}"."notAfter" <= ?::timestamptz + ?::interval + ?::interval`, [
          scope.asOf,
          scope.alertBeforeInterval,
          scope.leadInterval
        ])
        .whereRaw("(?) < ?", [deliveredChannelCountSince, channelIds.length])
        .orderBy("lastDelivered.lastDeliveredAt", "asc")
        .orderBy(`${TableName.Certificate}.notAfter`, "asc")
        .limit(MAX_EXPIRING_CERTIFICATES_PER_RUN - notFullyNotified.length)) as TApplicationAlertCertificate[];

      return [...notFullyNotified, ...leastRecentlyNotified];
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
