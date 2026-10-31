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

  const findValidByPublicKeyFingerprints = async (projectId: string, publicKeyFingerprints: string[]) => {
    const now = new Date();
    const crossSignedCerts = await db(TableName.CertificateAuthorityCrossSignedCert)
      .join(
        TableName.CertificateAuthority,
        `${TableName.CertificateAuthority}.id`,
        `${TableName.CertificateAuthorityCrossSignedCert}.caId`
      )
      .where(`${TableName.CertificateAuthority}.projectId`, projectId)
      .whereIn(`${TableName.CertificateAuthorityCrossSignedCert}.publicKeyFingerprint`, publicKeyFingerprints)
      .where(`${TableName.CertificateAuthorityCrossSignedCert}.notBefore`, "<=", now)
      .where(`${TableName.CertificateAuthorityCrossSignedCert}.notAfter`, ">", now)
      .select(selectAllTableCols(TableName.CertificateAuthorityCrossSignedCert));

    return crossSignedCerts;
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
    findValidByPublicKeyFingerprints,
    findByCaIdForUpdate
  };
};
