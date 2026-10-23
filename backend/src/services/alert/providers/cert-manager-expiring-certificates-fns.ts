import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { AlertRunStatus, TAlreadyAlertedFilter } from "@app/services/alert/alert-types";
import { CertStatus } from "@app/services/certificate/certificate-types";

export const MAX_EXPIRING_CERTIFICATES_PER_RUN = 1000;

export type TExpiringCertificatesScan = {
  alertBeforeInterval: string;
  leadInterval: string;
  asOf: Date;
  alreadyAlerted: TAlreadyAlertedFilter;
};

export const scanExpiringCertificates = async <T>(
  reader: Knex,
  selectCertificates: () => Knex.QueryBuilder,
  { alertBeforeInterval, leadInterval, asOf, alreadyAlerted }: TExpiringCertificatesScan
): Promise<T[]> => {
  const { alertId, channelIds, since } = alreadyAlerted;

  const selectDue = () =>
    selectCertificates()
      .whereNot(`${TableName.Certificate}.status`, CertStatus.REVOKED)
      .whereRaw(`"${TableName.Certificate}"."notAfter" > ?::timestamptz`, [asOf])
      .whereRaw(`"${TableName.Certificate}"."notAfter" <= ?::timestamptz + ?::interval + ?::interval`, [
        asOf,
        alertBeforeInterval,
        leadInterval
      ]);

  const deliveredOnEveryChannel = reader(`${TableName.AlertHistory} as deliveredHist`)
    .join(`${TableName.AlertHistoryTarget} as deliveredTgt`, "deliveredHist.id", "deliveredTgt.alertHistoryId")
    .where("deliveredHist.alertId", alertId)
    .where("deliveredTgt.status", AlertRunStatus.SUCCESS)
    .whereIn("deliveredTgt.channelId", channelIds)
    .groupBy("deliveredTgt.targetId")
    .havingRaw(`count(distinct "deliveredTgt"."channelId") >= ?`, [channelIds.length]);

  const notFullyNotified = (await selectDue()
    .whereRaw(`"${TableName.Certificate}".id::text not in (?)`, [
      deliveredOnEveryChannel.clone().select("deliveredTgt.targetId")
    ])
    .orderBy(`${TableName.Certificate}.notAfter`, "asc")
    .limit(MAX_EXPIRING_CERTIFICATES_PER_RUN)) as T[];
  if (notFullyNotified.length >= MAX_EXPIRING_CERTIFICATES_PER_RUN) return notFullyNotified;

  const deliveredChannelCountSince = reader(`${TableName.AlertHistory} as hist`)
    .join(`${TableName.AlertHistoryTarget} as tgt`, "hist.id", "tgt.alertHistoryId")
    .where("hist.alertId", alertId)
    .where("hist.triggeredAt", ">=", since)
    .where("tgt.status", AlertRunStatus.SUCCESS)
    .whereIn("tgt.channelId", channelIds)
    .whereRaw(`"tgt"."targetId" = "${TableName.Certificate}".id::text`)
    .countDistinct("tgt.channelId");
  const leastRecentlyNotified = (await selectDue()
    .joinRaw(`inner join (?) as "lastDelivered" on "lastDelivered"."targetId" = "${TableName.Certificate}".id::text`, [
      deliveredOnEveryChannel
        .clone()
        .select("deliveredTgt.targetId")
        .max("deliveredHist.triggeredAt as lastDeliveredAt")
    ])
    .whereRaw("(?) < ?", [deliveredChannelCountSince, channelIds.length])
    .orderBy("lastDelivered.lastDeliveredAt", "asc")
    .orderBy(`${TableName.Certificate}.notAfter`, "asc")
    .limit(MAX_EXPIRING_CERTIFICATES_PER_RUN - notFullyNotified.length)) as T[];

  return [...notFullyNotified, ...leastRecentlyNotified];
};
