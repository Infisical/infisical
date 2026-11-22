import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TCertificateAuthorityCrossSignedCerts } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { MAX_CA_HIERARCHY_DEPTH } from "@app/services/certificate-authority/certificate-authority-dal";

export type TCertificateAuthorityCrossSignedCertDALFactory = ReturnType<
  typeof certificateAuthorityCrossSignedCertDALFactory
>;

export const certificateAuthorityCrossSignedCertDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.CertificateAuthorityCrossSignedCert);

  const caHierarchyQuery = (knex: Knex, caId: string) =>
    knex.withRecursive("ca_hierarchy", (cte) => {
      void cte
        .select("caId", "parentCaId", knex.raw("0 as depth"))
        .from(TableName.InternalCertificateAuthority)
        .where("caId", caId)
        .union((builder) => {
          void builder
            .select("ica.caId", "ica.parentCaId", knex.raw("ca_hierarchy.depth + 1"))
            .from({ ica: TableName.InternalCertificateAuthority })
            .innerJoin("ca_hierarchy", "ca_hierarchy.parentCaId", "ica.caId")
            .where("ca_hierarchy.depth", "<", MAX_CA_HIERARCHY_DEPTH);
        });
    });

  const crossSignedCertsInCaHierarchy = (knex: Knex, caId: string) =>
    caHierarchyQuery(knex, caId)
      .from(TableName.CertificateAuthorityCrossSignedCert)
      .join("ca_hierarchy", "ca_hierarchy.caId", `${TableName.CertificateAuthorityCrossSignedCert}.caId`)
      .where(`${TableName.CertificateAuthorityCrossSignedCert}.notAfter`, ">", new Date());

  const findValidInCaHierarchy = async (caId: string, publicKeyFingerprints: string[]) => {
    try {
      const crossSignedCerts = await crossSignedCertsInCaHierarchy(db, caId)
        .whereIn(`${TableName.CertificateAuthorityCrossSignedCert}.publicKeyFingerprint`, publicKeyFingerprints)
        .where(`${TableName.CertificateAuthorityCrossSignedCert}.notBefore`, "<=", new Date())
        .select(selectAllTableCols(TableName.CertificateAuthorityCrossSignedCert));

      return crossSignedCerts as TCertificateAuthorityCrossSignedCerts[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindValidCaCrossSignedCertsInCaHierarchy" });
    }
  };

  const lockCaHierarchyAndFindUnexpired = async (caId: string, tx: Knex) => {
    try {
      const hierarchyCaIds = (await caHierarchyQuery(tx, caId).select("caId").from("ca_hierarchy")).map(
        ({ caId: hierarchyCaId }: { caId: string }) => hierarchyCaId
      );
      await tx(TableName.CertificateAuthority).whereIn("id", hierarchyCaIds).orderBy("id").forUpdate().select("id");

      const crossSignedCerts = await crossSignedCertsInCaHierarchy(tx, caId)
        .join(
          TableName.CertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.CertificateAuthorityCrossSignedCert}.caId`
        )
        .select(
          selectAllTableCols(TableName.CertificateAuthorityCrossSignedCert),
          "ca_hierarchy.depth",
          tx.ref("name").withSchema(TableName.CertificateAuthority).as("caName")
        );

      return crossSignedCerts as (TCertificateAuthorityCrossSignedCerts & { depth: number; caName: string })[];
    } catch (error) {
      throw new DatabaseError({ error, name: "LockCaHierarchyAndFindUnexpiredCrossSignedCerts" });
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
    lockCaHierarchyAndFindUnexpired,
    findByCaIdForUpdate
  };
};
