import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TPkiAlertHistory } from "@app/db/schemas/pki-alert-history";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

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

  const findByAlertId = async (
    alertId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<TPkiAlertHistory[]> => {
    try {
      let query = db
        .replicaNode()
        .select(selectAllTableCols(TableName.PkiAlertHistory))
        .from(TableName.PkiAlertHistory)
        .where(`${TableName.PkiAlertHistory}.alertId`, alertId)
        .orderBy(`${TableName.PkiAlertHistory}.triggeredAt`, "desc");

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.offset(options.offset);
      }

      const results = await query;
      return results as TPkiAlertHistory[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlertId" });
    }
  };

  const findRecentlyAlertedCertificates = async (
    alertId: string,
    certificateIds: string[],
    withinHours = 24
  ): Promise<string[]> => {
    try {
      if (certificateIds.length === 0) return [];

      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - withinHours);

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
    findByAlertId,
    findRecentlyAlertedCertificates
  };
};
