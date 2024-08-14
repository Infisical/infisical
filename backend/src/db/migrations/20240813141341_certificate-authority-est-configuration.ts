import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasEstConfigTable = await knex.schema.hasTable(TableName.CertificateAuthorityEstConfig);
  if (!hasEstConfigTable) {
    await knex.schema.createTable(TableName.CertificateAuthorityEstConfig, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.uuid("caId").notNullable().unique();
      tb.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      tb.binary("encryptedCaChain").notNullable();
      tb.string("hashedPassphrase").notNullable();
      tb.boolean("isEnabled");
      tb.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.CertificateAuthorityEstConfig);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.CertificateAuthorityEstConfig);
  await dropOnUpdateTrigger(knex, TableName.CertificateAuthorityEstConfig);
}
