import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
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
        .where(`${TableName.CertificateAuthority}.projectId`, "=", projectId)
        .select(selectAllTableCols(TableName.CertificateTemplate))
        .select(
          db.ref("friendlyName").as("caName").withSchema(TableName.CertificateAuthority),
          db.ref("projectId").withSchema(TableName.CertificateAuthority)
        );

      return certTemplates;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get certificate templates by project ID" });
    }
  };

  const getById = async (id: string) => {
    try {
      const certTemplate = await db
        .replicaNode()(TableName.CertificateTemplate)
        .join(
          TableName.CertificateAuthority,
          `${TableName.CertificateAuthority}.id`,
          `${TableName.CertificateTemplate}.caId`
        )
        .where(`${TableName.CertificateTemplate}.id`, "=", id)
        .select(selectAllTableCols(TableName.CertificateTemplate))
        .select(
          db.ref("projectId").withSchema(TableName.CertificateAuthority),
          db.ref("friendlyName").as("caName").withSchema(TableName.CertificateAuthority)
        )
        .first();

      return certTemplate;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get certificate template by ID" });
    }
  };

  return { ...certificateTemplateOrm, getCertTemplatesByProjectId, getById };
};
