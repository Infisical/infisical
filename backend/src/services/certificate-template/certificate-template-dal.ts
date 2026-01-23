import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TCertificateTemplateDALFactory = ReturnType<typeof certificateTemplateDALFactory>;

export const certificateTemplateDALFactory = (db: TDbClient) => {
  const certificateTemplateOrm = ormify(db, TableName.CertificateTemplate);

  const getCertTemplatesByProjectId = async (projectId: string) => {
    try {
      const certTemplates = await db
        .replicaNode()(TableName.CertificateTemplate)
        .join(
          TableName.CertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.CertificateTemplate}.caId`
        )
        .join(
          TableName.InternalCertificateAuthority,
          `${TableName.InternalCertificateAuthority}.caId`,
          `${TableName.CertificateAuthority}.id`
        )
        .where(`${TableName.CertificateAuthority}.projectId`, "=", projectId)
        .select(selectAllTableCols(TableName.CertificateTemplate))
        .select(
          db.ref("friendlyName").as("caName").withSchema(TableName.InternalCertificateAuthority),
          db.ref("projectId").withSchema(TableName.CertificateAuthority)
        );

      return certTemplates;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get certificate templates by project ID" });
    }
  };

  const getById = async (id: string, tx?: Knex) => {
    try {
      const certTemplate = await (tx || db.replicaNode())(TableName.CertificateTemplate)
        .join(
          TableName.CertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.CertificateTemplate}.caId`
        )
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.CertificateAuthority}.projectId`)
        .join(
          TableName.InternalCertificateAuthority,
          `${TableName.InternalCertificateAuthority}.caId`,
          `${TableName.CertificateAuthority}.id`
        )
        .where(`${TableName.CertificateTemplate}.id`, "=", id)
        .select(selectAllTableCols(TableName.CertificateTemplate))
        .select(
          db.ref("projectId").withSchema(TableName.CertificateAuthority),
          db.ref("friendlyName").as("caName").withSchema(TableName.InternalCertificateAuthority),
          db.ref("orgId").withSchema(TableName.Project)
        )
        .first();

      return certTemplate;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get certificate template by ID" });
    }
  };

  return { ...certificateTemplateOrm, getCertTemplatesByProjectId, getById };
};
