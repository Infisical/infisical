import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasEstConfigTable = await knex.schema.hasTable(TableName.CertificateTemplateEstConfig);
  if (!hasEstConfigTable) {
    await knex.schema.createTable(TableName.CertificateTemplateEstConfig, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.uuid("certificateTemplateId").notNullable().unique();
      tb.foreign("certificateTemplateId").references("id").inTable(TableName.CertificateTemplate).onDelete("CASCADE");
      tb.binary("encryptedCaChain").notNullable();
      tb.string("hashedPassphrase").notNullable();
      tb.boolean("isEnabled").notNullable();
      tb.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.CertificateTemplateEstConfig);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.CertificateTemplateEstConfig);
  await dropOnUpdateTrigger(knex, TableName.CertificateTemplateEstConfig);
}
