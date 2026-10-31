import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TCertificateAuthorityCrossSignedCerts } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TCertificateAuthorityCrossSignedCertDALFactory = ReturnType<
  typeof certificateAuthorityCrossSignedCertDALFactory
>;

export const certificateAuthorityCrossSignedCertDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.CertificateAuthorityCrossSignedCert);

  const findValidInCaHierarchy = async (caId: string, publicKeyFingerprints: string[]) => {
    try {
      const now = new Date();
      const crossSignedCerts = await db
        .withRecursive("ca_hierarchy", (cte) => {
          void cte
            .select("caId", "parentCaId")
            .from(TableName.InternalCertificateAuthority)
            .where("caId", caId)
            .union((builder) => {
              void builder
                .select("ica.caId", "ica.parentCaId")
                .from({ ica: TableName.InternalCertificateAuthority })
                .innerJoin("ca_hierarchy", "ca_hierarchy.parentCaId", "ica.caId");
            });
        })
        .from(TableName.CertificateAuthorityCrossSignedCert)
        .join("ca_hierarchy", "ca_hierarchy.caId", `${TableName.CertificateAuthorityCrossSignedCert}.caId`)
        .whereIn(`${TableName.CertificateAuthorityCrossSignedCert}.publicKeyFingerprint`, publicKeyFingerprints)
        .where(`${TableName.CertificateAuthorityCrossSignedCert}.notBefore`, "<=", now)
        .where(`${TableName.CertificateAuthorityCrossSignedCert}.notAfter`, ">", now)
        .select(selectAllTableCols(TableName.CertificateAuthorityCrossSignedCert));

      return crossSignedCerts as TCertificateAuthorityCrossSignedCerts[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindValidCaCrossSignedCertsInCaHierarchy" });
    }
  };

  const findByCaIdForUpdate = async (
    caId: string,
    tx: Knex
  ): Promise<TCertificateAuthorityCrossSignedCerts | undefined> => {
    try {
      await tx(TableName.CertificateAuthority).where({ id: caId }).forUpdate().first();
      return (await tx(TableName.CertificateAuthorityCrossSignedCert).where({ caId }).first()) as
        | TCertificateAuthorityCrossSignedCerts
        | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindCaCrossSignedCertByCaIdForUpdate" });
    }
  };

  return {
    ...orm,
    findValidInCaHierarchy,
    findByCaIdForUpdate
  };
};
