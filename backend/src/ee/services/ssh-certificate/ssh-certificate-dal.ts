import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TSshCertificateDALFactory = ReturnType<typeof sshCertificateDALFactory>;

export const sshCertificateDALFactory = (db: TDbClient) => {
  const sshCertificateOrm = ormify(db, TableName.SshCertificate);

  const countSshCertificatesInOrg = async (orgId: string) => {
    try {
      interface CountResult {
        count: string;
      }

      const query = db
        .replicaNode()(TableName.SshCertificate)
        .join(
          TableName.SshCertificateAuthority,
          `${TableName.SshCertificate}.sshCaId`,
          `${TableName.SshCertificateAuthority}.id`
        )
        .join(TableName.Organization, `${TableName.SshCertificateAuthority}.orgId`, `${TableName.Organization}.id`)
        .where(`${TableName.Organization}.id`, orgId);

      const count = await query.count("*").first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all SSH certificates in organization" });
    }
  };
  return {
    ...sshCertificateOrm,
    countSshCertificatesInOrg
  };
};
