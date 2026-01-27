import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PkiCertificateProfile, "defaultTtlDays");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.integer("defaultTtlDays").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PkiCertificateProfile, "defaultTtlDays");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.dropColumn("defaultTtlDays");
    });
  }
}
