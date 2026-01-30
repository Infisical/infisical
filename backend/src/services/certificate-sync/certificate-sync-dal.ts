import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TCertificateSyncs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols } from "@app/lib/knex";

import { CertificateSyncStatus } from "./certificate-sync-enums";

export type TCertificateSyncDALFactory = ReturnType<typeof certificateSyncDALFactory>;

type CertificateSyncFindFilter = Parameters<typeof buildFindFilter<TCertificateSyncs>>[0];

export const certificateSyncDALFactory = (db: TDbClient) => {
  const certificateSyncOrm = ormify(db, TableName.CertificateSync);

  const findByPkiSyncId = async (pkiSyncId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db)(TableName.CertificateSync)
        .where({ pkiSyncId })
        .select(selectAllTableCols(TableName.CertificateSync));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByPkiSyncId" });
    }
  };

  const findByCertificateId = async (certificateId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.CertificateSync)
        .where({ certificateId })
        .select(selectAllTableCols(TableName.CertificateSync));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByCertificateId" });
    }
  };

  const findByPkiSyncAndCertificate = async (pkiSyncId: string, certificateId: string, tx?: Knex) => {
    try {
      const doc = await (tx || db)(TableName.CertificateSync)
        .where({ pkiSyncId, certificateId })
        .select(selectAllTableCols(TableName.CertificateSync))
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByPkiSyncAndCertificate" });
    }
  };

  const findCertificateIdsByPkiSyncId = async (pkiSyncId: string, tx?: Knex): Promise<string[]> => {
    try {
      const docs = (await (tx || db.replicaNode())(TableName.CertificateSync)
        .where({ pkiSyncId })
        .select("certificateId")) as Array<{ certificateId: string }>;
      return docs.map((doc) => doc.certificateId);
    } catch (error) {
      throw new DatabaseError({ error, name: "FindCertificateIdsByPkiSyncId" });
    }
  };

  const findPkiSyncIdsByCertificateId = async (certificateId: string, tx?: Knex): Promise<string[]> => {
    try {
      const docs = (await (tx || db.replicaNode())(TableName.CertificateSync)
        .where({ certificateId })
        .select("pkiSyncId")) as Array<{ pkiSyncId: string }>;
      return docs.map((doc) => doc.pkiSyncId);
    } catch (error) {
      throw new DatabaseError({ error, name: "FindPkiSyncIdsByCertificateId" });
    }
  };

  const addCertificates = async (
    pkiSyncId: string,
    certificateData: Array<{ certificateId: string; externalIdentifier?: string }>,
    tx?: Knex
  ): Promise<TCertificateSyncs[]> => {
    try {
      const insertData = certificateData.map(({ certificateId, externalIdentifier }) => ({
        pkiSyncId,
        certificateId,
        syncStatus: CertificateSyncStatus.Pending,
        externalIdentifier
      }));

      const docs = await (tx || db)(TableName.CertificateSync).insert(insertData).returning("*");

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "AddCertificates" });
    }
  };

  const removeCertificates = async (pkiSyncId: string, certificateIds: string[], tx?: Knex): Promise<number> => {
    try {
      const deletedCount = await (tx || db)(TableName.CertificateSync)
        .where({ pkiSyncId })
        .whereIn("certificateId", certificateIds)
        .del();

      return deletedCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "RemoveCertificates" });
    }
  };

  const removeAllCertificatesFromSync = async (pkiSyncId: string, tx?: Knex): Promise<number> => {
    try {
      const deletedCount = await (tx || db)(TableName.CertificateSync).where({ pkiSyncId }).del();
      return deletedCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "RemoveAllCertificatesFromSync" });
    }
  };

  const updateSyncStatus = async (
    pkiSyncId: string,
    certificateId: string,
    status: string,
    message?: string,
    tx?: Knex
  ): Promise<TCertificateSyncs | undefined> => {
    try {
      const updateData: Partial<TCertificateSyncs> = {
        syncStatus: status,
        lastSyncedAt: new Date()
      };

      if (message !== undefined) {
        updateData.lastSyncMessage = message;
      }

      const docs = await (tx || db)(TableName.CertificateSync)
        .where({ pkiSyncId, certificateId })
        .update(updateData)
        .returning("*");

      return docs[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "UpdateSyncStatus" });
    }
  };

  const bulkUpdateSyncStatus = async (
    updates: Array<{
      pkiSyncId: string;
      certificateId: string;
      status: string;
      message?: string;
    }>,
    tx?: Knex
  ): Promise<void> => {
    try {
      if (tx) {
        for (const update of updates) {
          // eslint-disable-next-line no-await-in-loop
          await updateSyncStatus(update.pkiSyncId, update.certificateId, update.status, update.message, tx);
        }
      } else {
        await certificateSyncOrm.transaction(async (trx) => {
          for (const update of updates) {
            // eslint-disable-next-line no-await-in-loop
            await updateSyncStatus(update.pkiSyncId, update.certificateId, update.status, update.message, trx);
          }
        });
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "BulkUpdateSyncStatus" });
    }
  };

  const updateSyncMetadata = async (
    pkiSyncId: string,
    certificateId: string,
    metadata: Record<string, unknown> | null,
    tx?: Knex
  ): Promise<TCertificateSyncs | undefined> => {
    try {
      const docs = await (tx || db)(TableName.CertificateSync)
        .where({ pkiSyncId, certificateId })
        .update({ syncMetadata: metadata ? JSON.stringify(metadata) : null })
        .returning("*");

      return docs[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "UpdateSyncMetadata" });
    }
  };

  const clearSyncMetadataFlag = async (pkiSyncId: string, flag: string, tx?: Knex): Promise<void> => {
    try {
      await (tx || db)(TableName.CertificateSync)
        .where({ pkiSyncId })
        .whereNotNull("syncMetadata")
        .whereRaw(`"syncMetadata" \\? ?`, [flag])
        .update({
          syncMetadata: db.raw(`CASE WHEN "syncMetadata" - ? = '{}'::jsonb THEN NULL ELSE "syncMetadata" - ? END`, [
            flag,
            flag
          ])
        });
    } catch (error) {
      throw new DatabaseError({ error, name: "ClearSyncMetadataFlag" });
    }
  };

  const findWithDetails = async (
    options: {
      filter?: CertificateSyncFindFilter;
      pkiSyncId?: string;
      offset?: number;
      limit?: number;
    },
    tx?: Knex
  ): Promise<{
    certificateDetails: (TCertificateSyncs & {
      certificateSerialNumber?: string;
      certificateCommonName?: string;
      certificateAltNames?: string;
      certificateStatus?: string;
      certificateNotBefore?: Date;
      certificateNotAfter?: Date;
      certificateRenewBeforeDays?: number | null;
      certificateRenewedByCertificateId?: string;
      certificateRenewalError?: string;
      pkiSyncName?: string;
      pkiSyncDestination?: string;
    })[];
    totalCount: number;
  }> => {
    try {
      const { filter, pkiSyncId, offset, limit } = options;

      const baseQuery = (tx || db.replicaNode())(TableName.CertificateSync)
        .leftJoin(TableName.Certificate, `${TableName.CertificateSync}.certificateId`, `${TableName.Certificate}.id`)
        .leftJoin(TableName.PkiSync, `${TableName.CertificateSync}.pkiSyncId`, `${TableName.PkiSync}.id`);

      if (filter) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        void baseQuery.where(buildFindFilter(filter));
      }
      if (pkiSyncId) {
        void baseQuery.where(`${TableName.CertificateSync}.pkiSyncId`, pkiSyncId);
      }

      const countResult = await baseQuery.clone().count("* as count");
      const totalCount = Number((countResult[0] as unknown as { count: string | number }).count);

      const query = baseQuery
        .select(selectAllTableCols(TableName.CertificateSync))
        .select(
          db.ref("serialNumber").withSchema(TableName.Certificate).as("certificateSerialNumber"),
          db.ref("commonName").withSchema(TableName.Certificate).as("certificateCommonName"),
          db.ref("altNames").withSchema(TableName.Certificate).as("certificateAltNames"),
          db.ref("status").withSchema(TableName.Certificate).as("certificateStatus"),
          db.ref("notBefore").withSchema(TableName.Certificate).as("certificateNotBefore"),
          db.ref("notAfter").withSchema(TableName.Certificate).as("certificateNotAfter"),
          db.ref("renewBeforeDays").withSchema(TableName.Certificate).as("certificateRenewBeforeDays"),
          db.ref("renewedByCertificateId").withSchema(TableName.Certificate).as("certificateRenewedByCertificateId"),
          db.ref("renewalError").withSchema(TableName.Certificate).as("certificateRenewalError"),
          db.ref("name").withSchema(TableName.PkiSync).as("pkiSyncName"),
          db.ref("destination").withSchema(TableName.PkiSync).as("pkiSyncDestination")
        )
        .orderByRaw(
          `CASE WHEN "${TableName.CertificateSync}"."syncMetadata"->>'isDefault' = 'true' THEN 0 ELSE 1 END ASC`
        )
        .orderBy(`${TableName.CertificateSync}.createdAt`, "desc");

      if (offset !== undefined) {
        void query.offset(offset);
      }
      if (limit !== undefined) {
        void query.limit(limit);
      }

      const certificateDetails = (await query) as (TCertificateSyncs & {
        certificateSerialNumber?: string;
        certificateCommonName?: string;
        certificateAltNames?: string;
        certificateStatus?: string;
        certificateNotBefore?: Date;
        certificateNotAfter?: Date;
        certificateRenewBeforeDays?: number;
        certificateRenewedByCertificateId?: string;
        certificateRenewalError?: string;
        pkiSyncName?: string;
        pkiSyncDestination?: string;
      })[];

      return { certificateDetails, totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindWithDetails" });
    }
  };

  return {
    ...certificateSyncOrm,
    findByPkiSyncId,
    findByCertificateId,
    findByPkiSyncAndCertificate,
    findCertificateIdsByPkiSyncId,
    findPkiSyncIdsByCertificateId,
    addCertificates,
    removeCertificates,
    removeAllCertificatesFromSync,
    updateSyncStatus,
    bulkUpdateSyncStatus,
    updateSyncMetadata,
    clearSyncMetadataFlag,
    findWithDetails
  };
};
