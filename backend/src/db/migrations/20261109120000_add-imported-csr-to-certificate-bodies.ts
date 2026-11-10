import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateBody)) {
    const hasImportedCsr = await knex.schema.hasColumn(TableName.CertificateBody, "importedCsr");
    if (!hasImportedCsr) {
      await knex.schema.alterTable(TableName.CertificateBody, (t) => {
        t.text("importedCsr").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateBody)) {
    const hasImportedCsr = await knex.schema.hasColumn(TableName.CertificateBody, "importedCsr");
    if (hasImportedCsr) {
      await knex.schema.alterTable(TableName.CertificateBody, (t) => {
        t.dropColumn("importedCsr");
      });
    }
  }
}
