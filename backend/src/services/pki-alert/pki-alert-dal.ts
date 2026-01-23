import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { PkiItemType } from "../pki-collection/pki-collection-types";

export type TPkiAlertDALFactory = ReturnType<typeof pkiAlertDALFactory>;

export const pkiAlertDALFactory = (db: TDbClient) => {
  const pkiAlertOrm = ormify(db, TableName.PkiAlert);

  const getExpiringPkiCollectionItemsForAlerting = async () => {
    try {
      type AlertItem = {
        type: PkiItemType;
        id: string; // id of the CA or certificate
        expiryDate: Date;
        serialNumber: string;
        friendlyName: string;
        pkiCollectionId: string;
        alertId: string;
        alertName: string;
        alertBeforeDays: number;
        recipientEmails: string;
      };

      // gets CAs and certificates as part of PKI collection items
      const combinedQuery = db
        .replicaNode()
        .select(
          db.raw("? as type", [PkiItemType.CA]),
          `${PkiItemType.CA}.id`,
          "ic.notAfter as expiryDate",
          "ic.serialNumber",
          "ic.friendlyName",
          "pci.pkiCollectionId"
        )
        .from(`${TableName.CertificateAuthority} as ${PkiItemType.CA}`)
        .join(`${TableName.InternalCertificateAuthority} as ic`, `${PkiItemType.CA}.id`, "ic.caId")
        .join(`${TableName.PkiCollectionItem} as pci`, `${PkiItemType.CA}.id`, "pci.caId")
        .unionAll((qb) => {
          void qb
            .select(
              db.raw("? as type", [PkiItemType.CERTIFICATE]),
              `${PkiItemType.CERTIFICATE}.id`,
              `${PkiItemType.CERTIFICATE}.notAfter as expiryDate`,
              `${PkiItemType.CERTIFICATE}.serialNumber`,
              `${PkiItemType.CERTIFICATE}.friendlyName`,
              "pci.pkiCollectionId"
            )
            .from(`${TableName.Certificate} as ${PkiItemType.CERTIFICATE}`)
            .join(`${TableName.PkiCollectionItem} as pci`, `${PkiItemType.CERTIFICATE}.id`, "pci.certId");
        });

      /**
       * Gets alerts to send based on alertBeforeDays on PKI alerts connected to PKI collection items
       * Note: Results are clamped to 1-day window to avoid sending multiple alerts for the same item
       */
      const alertQuery = db
        .replicaNode()
        .select("combined.*", "pa.id as alertId", "pa.name as alertName", "pa.alertBeforeDays", "pa.recipientEmails")
        .from(db.raw("(?) as combined", [combinedQuery]))
        .join(`${TableName.PkiAlert} as pa`, "combined.pkiCollectionId", "pa.pkiCollectionId")
        .whereRaw(
          `
          combined."expiryDate" <= CURRENT_TIMESTAMP + (pa."alertBeforeDays" * INTERVAL '1 day')
          AND combined."expiryDate" > CURRENT_TIMESTAMP + ((pa."alertBeforeDays" - 1) * INTERVAL '1 day')
        `
        )
        .orderBy("combined.expiryDate");

      const results = (await alertQuery) as AlertItem[];

      return results;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get expiring PKI collection items for alerting" });
    }
  };

  return {
    getExpiringPkiCollectionItemsForAlerting,
    ...pkiAlertOrm
  };
};
