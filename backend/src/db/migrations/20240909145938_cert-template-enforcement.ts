import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateAuthority)) {
    const hasTemplateIssuanceRequiredColumn = await knex.schema.hasColumn(
      TableName.CertificateAuthority,
      "templateIssuanceRequired"
    );
    if (!hasTemplateIssuanceRequiredColumn) {
      await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
        t.boolean("requireTemplateForIssuance").notNullable().defaultTo(false);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateAuthority)) {
    await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
      t.dropColumn("requireTemplateForIssuance");
    });
  }
}
