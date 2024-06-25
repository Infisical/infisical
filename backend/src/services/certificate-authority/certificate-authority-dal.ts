import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TCertificateAuthorityDALFactory = ReturnType<typeof certificateAuthorityDALFactory>;

export const certificateAuthorityDALFactory = (db: TDbClient) => {
  const caOrm = ormify(db, TableName.CertificateAuthority);

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
    buildCertificateChain
  };
};
