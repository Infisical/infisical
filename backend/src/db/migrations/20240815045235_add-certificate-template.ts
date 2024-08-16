import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasCertificateTemplateTable = await knex.schema.hasTable(TableName.CertificateTemplate);
  if (!hasCertificateTemplateTable) {
    await knex.schema.createTable(TableName.CertificateTemplate, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.uuid("caId").notNullable();
      tb.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      tb.uuid("pkiCollectionId");
      tb.foreign("pkiCollectionId").references("id").inTable(TableName.PkiCollection).onDelete("SET NULL");
      tb.string("name").notNullable();
      tb.string("commonName").notNullable();
      tb.string("subjectAlternativeName").notNullable();
      tb.string("ttl").notNullable();
      tb.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.CertificateTemplate);
  }

  const doesCertificateTableHaveTemplateId = await knex.schema.hasColumn(
    TableName.Certificate,
    "certificateTemplateId"
  );

  if (!doesCertificateTableHaveTemplateId) {
    await knex.schema.alterTable(TableName.Certificate, (tb) => {
      tb.uuid("certificateTemplateId");
      tb.foreign("certificateTemplateId").references("id").inTable(TableName.CertificateTemplate).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesCertificateTableHaveTemplateId = await knex.schema.hasColumn(
    TableName.Certificate,
    "certificateTemplateId"
  );

  if (doesCertificateTableHaveTemplateId) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.dropColumn("certificateTemplateId");
    });
  }

  const hasCertificateTemplateTable = await knex.schema.hasTable(TableName.CertificateTemplate);
  if (hasCertificateTemplateTable) {
    await knex.schema.dropTable(TableName.CertificateTemplate);
    await dropOnUpdateTrigger(knex, TableName.CertificateTemplate);
  }
}
