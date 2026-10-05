import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { AlertRunStatus, TAlreadyAlertedFilter } from "@app/services/alert/alert-types";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { SignerStatus } from "@app/services/signer/signer-enums";

export type TCertManagerSignerAlertDALFactory = ReturnType<typeof certManagerSignerAlertDALFactory>;

export type TSignerAlertCertificate = {
  id: string;
  serialNumber: string;
  commonName: string;
  altNames: string | null;
  status: string;
  notBefore: Date;
  notAfter: Date;
  signerIds: string[];
  signerNames: string[];
};

const MAX_EXPIRING_SIGNER_CERTIFICATES_PER_RUN = 1000;

export const certManagerSignerAlertDALFactory = (db: TDbClient) => {
  const $selectSignerCertificates = (reader: Knex, projectId: string) =>
    reader(TableName.Certificate)
      .join(
        reader(TableName.PkiSigners)
          .where(`${TableName.PkiSigners}.projectId`, projectId)
          .where(`${TableName.PkiSigners}.status`, SignerStatus.Active)
          .whereNotNull(`${TableName.PkiSigners}.certificateId`)
          .groupBy(`${TableName.PkiSigners}.certificateId`)
          .select(`${TableName.PkiSigners}.certificateId`)
          .select(
            reader.raw(
              `array_agg("${TableName.PkiSigners}".id order by "${TableName.PkiSigners}".name) as "signerIds"`
            ),
            reader.raw(
              `array_agg("${TableName.PkiSigners}".name order by "${TableName.PkiSigners}".name) as "signerNames"`
            )
          )
          .as("signers"),
        "signers.certificateId",
        `${TableName.Certificate}.id`
      )
      .select(
        `${TableName.Certificate}.id`,
        `${TableName.Certificate}.serialNumber`,
        `${TableName.Certificate}.commonName`,
        `${TableName.Certificate}.altNames`,
        `${TableName.Certificate}.status`,
        `${TableName.Certificate}.notBefore`,
        `${TableName.Certificate}.notAfter`,
        "signers.signerIds",
        "signers.signerNames"
      );

  const findExpiringSignerCertificates = async (
    scope: {
      projectId: string;
      alertBeforeInterval: string;
      leadInterval: string;
      asOf: Date;
      alreadyAlerted: TAlreadyAlertedFilter;
    },
    tx?: Knex
  ): Promise<TSignerAlertCertificate[]> => {
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

      const notFullyNotified = (await $selectSignerCertificates(reader, scope.projectId)
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
        .limit(MAX_EXPIRING_SIGNER_CERTIFICATES_PER_RUN)) as TSignerAlertCertificate[];
      if (notFullyNotified.length >= MAX_EXPIRING_SIGNER_CERTIFICATES_PER_RUN) return notFullyNotified;

      const deliveredChannelCountSince = reader(`${TableName.AlertHistory} as hist`)
        .join(`${TableName.AlertHistoryTarget} as tgt`, "hist.id", "tgt.alertHistoryId")
        .where("hist.alertId", alertId)
        .where("hist.triggeredAt", ">=", since)
        .where("tgt.status", AlertRunStatus.SUCCESS)
        .whereIn("tgt.channelId", channelIds)
        .whereRaw(`"tgt"."targetId" = "${TableName.Certificate}".id::text`)
        .countDistinct("tgt.channelId");
      const leastRecentlyNotified = (await $selectSignerCertificates(reader, scope.projectId)
        .joinRaw(
          `inner join (?) as "lastDelivered" on "lastDelivered"."targetId" = "${TableName.Certificate}".id::text`,
          [
            deliveredOnEveryChannel
              .clone()
              .select("deliveredTgt.targetId")
              .max("deliveredHist.triggeredAt as lastDeliveredAt")
          ]
        )
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
        .limit(MAX_EXPIRING_SIGNER_CERTIFICATES_PER_RUN - notFullyNotified.length)) as TSignerAlertCertificate[];

      return [...notFullyNotified, ...leastRecentlyNotified];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindExpiringSignerCertificates" });
    }
  };

  return { findExpiringSignerCertificates };
};
