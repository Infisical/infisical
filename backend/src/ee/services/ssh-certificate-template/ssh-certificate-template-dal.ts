import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSshCertificateTemplateDALFactory = ReturnType<typeof sshCertificateTemplateDALFactory>;

export const sshCertificateTemplateDALFactory = (db: TDbClient) => {
  const sshCertificateTemplateOrm = ormify(db, TableName.SshCertificateTemplate);

  const getById = async (id: string, tx?: Knex) => {
    try {
      const certTemplate = await (tx || db.replicaNode())(TableName.SshCertificateTemplate)
        .join(
          TableName.SshCertificateAuthority,
          `${TableName.SshCertificateAuthority}.id`,
          `${TableName.SshCertificateTemplate}.sshCaId`
        )
        .join(TableName.Organization, `${TableName.Organization}.id`, `${TableName.SshCertificateAuthority}.orgId`)
        .where(`${TableName.SshCertificateTemplate}.id`, "=", id)
        .select(selectAllTableCols(TableName.SshCertificateTemplate))
        .select(
          db.ref("orgId").withSchema(TableName.SshCertificateAuthority),
          db.ref("friendlyName").as("caName").withSchema(TableName.SshCertificateAuthority),
          db.ref("status").as("caStatus").withSchema(TableName.SshCertificateAuthority)
        )
        .first();

      return certTemplate;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get SSH certificate template by ID" });
    }
  };

  return { ...sshCertificateTemplateOrm, getById };
};
