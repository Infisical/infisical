import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiCertificateInstallationCerts } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPkiCertificateInstallationCertDALFactory = ReturnType<typeof pkiCertificateInstallationCertDALFactory>;

export const pkiCertificateInstallationCertDALFactory = (db: TDbClient) => {
  const pkiCertificateInstallationCertOrm = ormify(db, TableName.PkiCertificateInstallationCert);

  const findByInstallationId = async (installationId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.PkiCertificateInstallationCert)
        .where({ installationId })
        .orderBy("lastSeenAt", "desc");

      return docs as TPkiCertificateInstallationCerts[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PKI certificate installation certs by installation ID" });
    }
  };

  const upsertCertLink = async (
    installationId: string,
    certificateId: string,
    data: { firstSeenAt?: Date; lastSeenAt: Date; isCurrentlyPresent?: boolean },
    tx?: Knex
  ) => {
    try {
      const existing = await (tx || db)(TableName.PkiCertificateInstallationCert)
        .where({ installationId, certificateId })
        .first();

      if (existing) {
        const updateData: Partial<TPkiCertificateInstallationCerts> = {
          lastSeenAt: data.lastSeenAt
        };
        if (data.isCurrentlyPresent !== undefined) {
          updateData.isCurrentlyPresent = data.isCurrentlyPresent;
        }

        await (tx || db)(TableName.PkiCertificateInstallationCert).where({ id: existing.id }).update(updateData);

        return { ...existing, ...updateData };
      }

      const [created] = await (tx || db)(TableName.PkiCertificateInstallationCert)
        .insert({
          installationId,
          certificateId,
          firstSeenAt: data.firstSeenAt || data.lastSeenAt,
          lastSeenAt: data.lastSeenAt,
          isCurrentlyPresent: data.isCurrentlyPresent ?? true
        })
        .returning("*");

      return created;
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert PKI certificate installation cert link" });
    }
  };

  const markOldCertsAsNotPresent = async (installationId: string, currentCertIds: string[], tx?: Knex) => {
    try {
      if (currentCertIds.length === 0) {
        await (tx || db)(TableName.PkiCertificateInstallationCert)
          .where({ installationId, isCurrentlyPresent: true })
          .update({ isCurrentlyPresent: false });
      } else {
        await (tx || db)(TableName.PkiCertificateInstallationCert)
          .where({ installationId, isCurrentlyPresent: true })
          .whereNotIn("certificateId", currentCertIds)
          .update({ isCurrentlyPresent: false });
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Mark old PKI certificate installation certs as not present" });
    }
  };

  return {
    ...pkiCertificateInstallationCertOrm,
    findByInstallationId,
    upsertCertLink,
    markOldCertsAsNotPresent
  };
};
