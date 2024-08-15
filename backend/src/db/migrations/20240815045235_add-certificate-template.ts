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
      tb.string("name").notNullable();
      tb.string("commonName").notNullable();
      tb.string("ttl").notNullable();
      tb.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.CertificateTemplate);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCertificateTemplateTable = await knex.schema.hasTable(TableName.CertificateTemplate);
  if (hasCertificateTemplateTable) {
    await knex.schema.dropTable(TableName.CertificateTemplate);
    await dropOnUpdateTrigger(knex, TableName.CertificateTemplate);
  }
}
