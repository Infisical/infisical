import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.InternalCertificateAuthority);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(
    TableName.InternalCertificateAuthority,
    "disableManagedCrlDistributionPointUrl"
  );

  if (!hasColumn) {
    await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
      t.boolean("disableManagedCrlDistributionPointUrl").defaultTo(false).notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.InternalCertificateAuthority);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(
    TableName.InternalCertificateAuthority,
    "disableManagedCrlDistributionPointUrl"
  );

  if (hasColumn) {
    await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
      t.dropColumn("disableManagedCrlDistributionPointUrl");
    });
  }
}
