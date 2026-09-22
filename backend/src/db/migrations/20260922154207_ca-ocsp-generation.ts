import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.InternalCertificateAuthority);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TableName.InternalCertificateAuthority, "ocspGeneration");

  if (!hasColumn) {
    await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
      t.integer("ocspGeneration").defaultTo(0).notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.InternalCertificateAuthority);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TableName.InternalCertificateAuthority, "ocspGeneration");

  if (hasColumn) {
    await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
      t.dropColumn("ocspGeneration");
    });
  }
}
