import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { AlertRunStatus, TAlreadyAlertedFilter } from "@app/services/alert/alert-types";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { SignerStatus } from "@app/services/signer/signer-enums";

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
  signerId?: string | null;
  signerName?: string | null;
};

type TExpiryWindow = {
  alertBeforeInterval: string;
  leadInterval: string;
  asOf: Date;
  alreadyAlerted?: TAlreadyAlertedFilter;
};

type TCertificateScope = {
  projectId: string;
  applicationId?: string | null;
  applicationIds?: string[];
  profileIds?: string[];
};

const MAX_EXPIRING_CERTIFICATES_PER_RUN = 1000;

const applyCertificateScope = <TQuery extends Knex.QueryBuilder>(
  query: TQuery,
  { projectId, applicationId, applicationIds, profileIds }: TCertificateScope
): TQuery => {
  void query.where(`${TableName.Certificate}.projectId`, projectId);
  if (applicationId) void query.where(`${TableName.Certificate}.applicationId`, applicationId);
  if (applicationIds?.length) void query.whereIn(`${TableName.Certificate}.applicationId`, applicationIds);
  if (profileIds?.length) void query.whereIn(`${TableName.Certificate}.profileId`, profileIds);
  return query;
};

const CERTIFICATE_TARGET_COLUMNS = [
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
];

const applyExpiryWindow = <TQuery extends Knex.QueryBuilder>(
  reader: Knex,
  query: TQuery,
  { alertBeforeInterval, leadInterval, asOf, alreadyAlerted }: TExpiryWindow
): TQuery => {
  if (alreadyAlerted?.channelIds.length) {
    const deliveredChannelCount = reader(`${TableName.AlertHistory} as hist`)
      .join(`${TableName.AlertHistoryTarget} as tgt`, "hist.id", "tgt.alertHistoryId")
      .where("hist.alertId", alreadyAlerted.alertId)
      .where("hist.triggeredAt", ">=", alreadyAlerted.since)
      .where("tgt.status", AlertRunStatus.SUCCESS)
      .whereIn("tgt.channelId", alreadyAlerted.channelIds)
      .whereRaw(`"tgt"."targetId" = "${TableName.Certificate}".id::text`)
      .countDistinct("tgt.channelId");
    void query.whereRaw("(?) < ?", [deliveredChannelCount, alreadyAlerted.channelIds.length]);
  }

  void query
    .whereNot(`${TableName.Certificate}.status`, CertStatus.REVOKED)
    .whereRaw(`"${TableName.Certificate}"."notAfter" > ?::timestamptz`, [asOf])
    .whereRaw(`"${TableName.Certificate}"."notAfter" <= ?::timestamptz + ?::interval + ?::interval`, [
      asOf,
      alertBeforeInterval,
      leadInterval
    ]);
  return query;
};

const selectExpiring = async (
  reader: Knex,
  buildQuery: () => Knex.QueryBuilder,
  window: TExpiryWindow
): Promise<TApplicationAlertCertificate[]> => {
  const { alreadyAlerted } = window;
  const dueQuery = () => applyExpiryWindow(reader, buildQuery(), window);

  if (!alreadyAlerted?.channelIds.length) {
    return (await dueQuery()
      .orderBy(`${TableName.Certificate}.notAfter`, "asc")
      .limit(MAX_EXPIRING_CERTIFICATES_PER_RUN)) as TApplicationAlertCertificate[];
  }

  const neverNotified = (await dueQuery()
    .whereNotExists(
      reader(`${TableName.AlertHistory} as notifiedHist`)
        .join(`${TableName.AlertHistoryTarget} as notifiedTgt`, "notifiedHist.id", "notifiedTgt.alertHistoryId")
        .where("notifiedHist.alertId", alreadyAlerted.alertId)
        .where("notifiedTgt.status", AlertRunStatus.SUCCESS)
        .whereRaw(`"notifiedTgt"."targetId" = "${TableName.Certificate}".id::text`)
        .select("notifiedTgt.id")
    )
    .orderBy(`${TableName.Certificate}.notAfter`, "asc")
    .limit(MAX_EXPIRING_CERTIFICATES_PER_RUN)) as TApplicationAlertCertificate[];
  if (neverNotified.length >= MAX_EXPIRING_CERTIFICATES_PER_RUN) return neverNotified;

  const lastDelivered = reader(`${TableName.AlertHistory} as lastHist`)
    .join(`${TableName.AlertHistoryTarget} as lastTgt`, "lastHist.id", "lastTgt.alertHistoryId")
    .where("lastHist.alertId", alreadyAlerted.alertId)
    .where("lastTgt.status", AlertRunStatus.SUCCESS)
    .groupBy("lastTgt.targetId")
    .select("lastTgt.targetId")
    .max("lastHist.triggeredAt as lastDeliveredAt");
  const leastRecentlyNotified = (await dueQuery()
    .joinRaw(`inner join (?) as "lastDelivered" on "lastDelivered"."targetId" = "${TableName.Certificate}".id::text`, [
      lastDelivered
    ])
    .orderBy("lastDelivered.lastDeliveredAt", "asc")
    .orderBy(`${TableName.Certificate}.notAfter`, "asc")
    .limit(MAX_EXPIRING_CERTIFICATES_PER_RUN - neverNotified.length)) as TApplicationAlertCertificate[];

  return [...neverNotified, ...leastRecentlyNotified];
};

export const certManagerApplicationAlertDALFactory = (db: TDbClient) => {
  const $selectCertificates = (reader: Knex, scope: TCertificateScope) => {
    const query = applyCertificateScope(
      reader(TableName.Certificate)
        .leftJoin(`${TableName.PkiCertificateProfile} as profile`, `${TableName.Certificate}.profileId`, "profile.id")
        .leftJoin(TableName.PkiApplication, `${TableName.Certificate}.applicationId`, `${TableName.PkiApplication}.id`),
      scope
    );

    return query.select(CERTIFICATE_TARGET_COLUMNS);
  };

  const findExpiringCertificates = async (
    scope: TCertificateScope & TExpiryWindow,
    tx?: Knex
  ): Promise<TApplicationAlertCertificate[]> => {
    try {
      const reader = tx || db.replicaNode();
      return await selectExpiring(
        reader,
        () => $selectCertificates(reader, scope).whereNull(`${TableName.Certificate}.renewedByCertificateId`),
        scope
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindExpiringCertificates" });
    }
  };

  const findExpiringSignerCertificates = async (
    scope: { projectId: string } & TExpiryWindow,
    tx?: Knex
  ): Promise<TApplicationAlertCertificate[]> => {
    try {
      const reader = tx || db.replicaNode();
      const buildQuery = () =>
        reader(TableName.PkiSigners)
          .join(TableName.Certificate, `${TableName.PkiSigners}.certificateId`, `${TableName.Certificate}.id`)
          .leftJoin(`${TableName.PkiCertificateProfile} as profile`, `${TableName.Certificate}.profileId`, "profile.id")
          .leftJoin(
            TableName.PkiApplication,
            `${TableName.Certificate}.applicationId`,
            `${TableName.PkiApplication}.id`
          )
          .where(`${TableName.PkiSigners}.projectId`, scope.projectId)
          .where(`${TableName.PkiSigners}.status`, SignerStatus.Active)
          .select([
            ...CERTIFICATE_TARGET_COLUMNS,
            `${TableName.PkiSigners}.id as signerId`,
            `${TableName.PkiSigners}.name as signerName`
          ]);
      return await selectExpiring(reader, buildQuery, scope);
    } catch (error) {
      throw new DatabaseError({ error, name: "FindExpiringSignerCertificates" });
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
    findExpiringSignerCertificates,
    findCertificatesByIds,
    findApplicationById,
    findApplicationNamesByIds,
    findProfileNamesByIds,
    findProjectApplicationIds,
    findProjectProfileIds
  };
};
