import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateBody)) {
    const hasCsr = await knex.schema.hasColumn(TableName.CertificateBody, "csr");
    if (!hasCsr) {
      await knex.schema.alterTable(TableName.CertificateBody, (t) => {
        t.text("csr").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateBody)) {
    const hasCsr = await knex.schema.hasColumn(TableName.CertificateBody, "csr");
    if (hasCsr) {
      await knex.schema.alterTable(TableName.CertificateBody, (t) => {
        t.dropColumn("csr");
      });
    }
  }
}
