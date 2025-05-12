import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { CertificateAuthoritiesSchema, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TCertificateAuthorityDALFactory = ReturnType<typeof certificateAuthorityDALFactory>;

export const certificateAuthorityDALFactory = (db: TDbClient) => {
  const caOrm = ormify(db, TableName.CertificateAuthority);

  const findByIdWithAssociatedCa = async (caId: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.CertificateAuthority)
      .leftJoin(
        TableName.InternalCertificateAuthority,
        `${TableName.CertificateAuthority}.id`,
        `${TableName.InternalCertificateAuthority}.certificateAuthorityId`
      )
      .where(`${TableName.CertificateAuthority}.id`, caId)
      .select(selectAllTableCols(TableName.CertificateAuthority))
      .select(
        db.ref("id").withSchema(TableName.InternalCertificateAuthority).as("internalCaId"),
        db.ref("parentCaId").withSchema(TableName.InternalCertificateAuthority).as("internalParentCaId"),
        db.ref("type").withSchema(TableName.InternalCertificateAuthority).as("internalType"),
        db.ref("status").withSchema(TableName.InternalCertificateAuthority).as("internalStatus"),
        db.ref("friendlyName").withSchema(TableName.InternalCertificateAuthority).as("internalFriendlyName"),
        db.ref("organization").withSchema(TableName.InternalCertificateAuthority).as("internalOrganization"),
        db.ref("ou").withSchema(TableName.InternalCertificateAuthority).as("internalOu"),
        db.ref("country").withSchema(TableName.InternalCertificateAuthority).as("internalCountry"),
        db.ref("province").withSchema(TableName.InternalCertificateAuthority).as("internalProvince"),
        db.ref("locality").withSchema(TableName.InternalCertificateAuthority).as("internalLocality"),
        db.ref("commonName").withSchema(TableName.InternalCertificateAuthority).as("internalCommonName"),
        db.ref("dn").withSchema(TableName.InternalCertificateAuthority).as("internalDn"),
        db.ref("serialNumber").withSchema(TableName.InternalCertificateAuthority).as("internalSerialNumber"),
        db.ref("maxPathLength").withSchema(TableName.InternalCertificateAuthority).as("internalMaxPathLength"),
        db.ref("keyAlgorithm").withSchema(TableName.InternalCertificateAuthority).as("internalKeyAlgorithm"),
        db.ref("notBefore").withSchema(TableName.InternalCertificateAuthority).as("internalNotBefore"),
        db.ref("notAfter").withSchema(TableName.InternalCertificateAuthority).as("internalNotAfter"),
        db.ref("activeCaCertId").withSchema(TableName.InternalCertificateAuthority).as("internalActiveCaCertId"),
        db
          .ref("certificateAuthorityId")
          .withSchema(TableName.InternalCertificateAuthority)
          .as("internalCertificateAuthorityId")
      )
      .first();

    const data = {
      ...CertificateAuthoritiesSchema.parse(result),
      internalCa: result
        ? {
            id: result.internalCaId,
            parentCaId: result.internalParentCaId,
            type: result.internalType,
            status: result.internalStatus,
            friendlyName: result.internalFriendlyName,
            organization: result.internalOrganization,
            ou: result.internalOu,
            country: result.internalCountry,
            province: result.internalProvince,
            locality: result.internalLocality,
            commonName: result.internalCommonName,
            dn: result.internalDn,
            serialNumber: result.internalSerialNumber,
            maxPathLength: result.internalMaxPathLength,
            keyAlgorithm: result.internalKeyAlgorithm,
            notBefore: result.internalNotBefore,
            notAfter: result.internalNotAfter,
            activeCaCertId: result.internalActiveCaCertId,
            certificateAuthorityId: result.internalCertificateAuthorityId
          }
        : undefined
    };

    return data;
  };

  // note: not used
  const buildCertificateChain = async (caId: string) => {
    try {
      const result: {
        caId: string;
        parentCaId?: string;
        encryptedCertificate: Buffer;
      }[] = await db
        .replicaNode()
        .withRecursive("cte", (cte) => {
          void cte
            .select("ca.id as caId", "ca.parentCaId", "cert.encryptedCertificate")
            .from({ ca: TableName.CertificateAuthority })
            .leftJoin({ cert: TableName.CertificateAuthorityCert }, "ca.id", "cert.caId")
            .where("ca.id", caId)
            .unionAll((builder) => {
              void builder
                .select("ca.id as caId", "ca.parentCaId", "cert.encryptedCertificate")
                .from({ ca: TableName.CertificateAuthority })
                .leftJoin({ cert: TableName.CertificateAuthorityCert }, "ca.id", "cert.caId")
                .innerJoin("cte", "cte.parentCaId", "ca.id");
            });
        })
        .select("*")
        .from("cte");

      // Extract certificates and reverse the order to have the root CA at the end
      const certChain: Buffer[] = result.map((row) => row.encryptedCertificate);
      return certChain;
    } catch (error) {
      throw new DatabaseError({ error, name: "BuildCertificateChain" });
    }
  };

  return {
    ...caOrm,
    buildCertificateChain,
    findByIdWithAssociatedCa
  };
};
