import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.CertificateSync, "externalIdentifier"))) {
    await knex.schema.alterTable(TableName.CertificateSync, (t) => {
      t.text("externalIdentifier").nullable();
      t.index("externalIdentifier");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.CertificateSync, "externalIdentifier")) {
    await knex.schema.alterTable(TableName.CertificateSync, (t) => {
      t.dropIndex("externalIdentifier");
      t.dropColumn("externalIdentifier");
    });
  }
}
