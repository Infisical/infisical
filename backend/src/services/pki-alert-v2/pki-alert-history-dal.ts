import { TDbClient } from "@app/db";
import { TableName, TPkiAlertHistory } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPkiAlertHistoryDALFactory = ReturnType<typeof pkiAlertHistoryDALFactory>;

export const pkiAlertHistoryDALFactory = (db: TDbClient) => {
  const pkiAlertHistoryOrm = ormify(db, TableName.PkiAlertHistory);

  const createWithCertificates = async (
    alertId: string,
    certificateIds: string[],
    options?: {
      hasNotificationSent?: boolean;
      notificationError?: string;
    }
  ): Promise<TPkiAlertHistory> => {
    try {
      return await db.transaction(async (tx) => {
        const historyRecords = await tx(TableName.PkiAlertHistory)
          .insert({
            alertId,
            hasNotificationSent: options?.hasNotificationSent || false,
            notificationError: options?.notificationError
          })
          .returning("*");

        const historyRecord = historyRecords[0];

        if (certificateIds.length > 0) {
          const certificateAssociations = certificateIds.map((certificateId) => ({
            alertHistoryId: historyRecord.id,
            certificateId
          }));

          await tx(TableName.PkiAlertHistoryCertificate).insert(certificateAssociations);
        }

        return historyRecord;
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "CreateWithCertificates" });
    }
  };

  const findRecentlyAlertedCertificates = async (
    alertId: string,
    certificateIds: string[],
    withinHours = 24
  ): Promise<string[]> => {
    try {
      if (certificateIds.length === 0) return [];

      const DEDUP_DRIFT_BUFFER_MINUTES = 15;
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - withinHours);
      cutoffDate.setMinutes(cutoffDate.getMinutes() + DEDUP_DRIFT_BUFFER_MINUTES);

      const results = (await db
        .replicaNode()
        .select("cert.certificateId")
        .from(`${TableName.PkiAlertHistory} as hist`)
        .join(`${TableName.PkiAlertHistoryCertificate} as cert`, "hist.id", "cert.alertHistoryId")
        .where("hist.alertId", alertId)
        .where("hist.hasNotificationSent", true)
        .where("hist.triggeredAt", ">=", cutoffDate)
        .whereIn("cert.certificateId", certificateIds)) as Array<{ certificateId: string }>;

      return results.map((row) => row.certificateId);
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRecentlyAlertedCertificates" });
    }
  };

  return {
    ...pkiAlertHistoryOrm,
    createWithCertificates,
    findRecentlyAlertedCertificates
  };
};
