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
    data: { firstSeenAt?: Date; lastSeenAt: Date },
    tx?: Knex
  ) => {
    try {
      const [result] = await (tx || db)(TableName.PkiCertificateInstallationCert)
        .insert({
          installationId,
          certificateId,
          firstSeenAt: data.firstSeenAt || data.lastSeenAt,
          lastSeenAt: data.lastSeenAt
        })
        .onConflict(["installationId", "certificateId"])
        .merge({ lastSeenAt: data.lastSeenAt })
        .returning("*");

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert PKI certificate installation cert link" });
    }
  };

  return {
    ...pkiCertificateInstallationCertOrm,
    findByInstallationId,
    upsertCertLink
  };
};
