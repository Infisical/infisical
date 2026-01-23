import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
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
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.SshCertificateAuthority}.projectId`)
        .where(`${TableName.SshCertificateTemplate}.id`, "=", id)
        .select(selectAllTableCols(TableName.SshCertificateTemplate))
        .select(
          db.ref("projectId").withSchema(TableName.SshCertificateAuthority),
          db.ref("friendlyName").as("caName").withSchema(TableName.SshCertificateAuthority),
          db.ref("status").as("caStatus").withSchema(TableName.SshCertificateAuthority)
        )
        .first();

      return certTemplate;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get SSH certificate template by ID" });
    }
  };

  /**
   * Returns the SSH certificate template named [name] within project with id [projectId]
   */
  const getByName = async (name: string, projectId: string, tx?: Knex) => {
    try {
      const certTemplate = await (tx || db.replicaNode())(TableName.SshCertificateTemplate)
        .join(
          TableName.SshCertificateAuthority,
          `${TableName.SshCertificateAuthority}.id`,
          `${TableName.SshCertificateTemplate}.sshCaId`
        )
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.SshCertificateAuthority}.projectId`)
        .where(`${TableName.SshCertificateTemplate}.name`, "=", name)
        .where(`${TableName.Project}.id`, "=", projectId)
        .select(selectAllTableCols(TableName.SshCertificateTemplate))
        .select(
          db.ref("projectId").withSchema(TableName.SshCertificateAuthority),
          db.ref("friendlyName").as("caName").withSchema(TableName.SshCertificateAuthority),
          db.ref("status").as("caStatus").withSchema(TableName.SshCertificateAuthority)
        )
        .first();

      return certTemplate;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get SSH certificate template by name" });
    }
  };

  return { ...sshCertificateTemplateOrm, getById, getByName };
};
