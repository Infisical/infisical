import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.IdentityTlsCertAuth, "verifyClientCertificateChain");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.IdentityTlsCertAuth, (t) => {
      // When false (default) the configured CA must be the direct issuer of the presented
      // leaf certificate (single-hop). When true, the configured CA is treated as a trust
      // anchor and the presented client chain (leaf + intermediates) is validated up to it.
      t.boolean("verifyClientCertificateChain").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.IdentityTlsCertAuth, "verifyClientCertificateChain");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.IdentityTlsCertAuth, (t) => {
      t.dropColumn("verifyClientCertificateChain");
    });
  }
}
