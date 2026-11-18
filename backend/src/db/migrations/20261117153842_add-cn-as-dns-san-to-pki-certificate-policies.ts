import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PkiCertificatePolicy, "addCommonNameAsDnsSan"))) {
    await knex.schema.alterTable(TableName.PkiCertificatePolicy, (t) => {
      t.boolean("addCommonNameAsDnsSan").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PkiCertificatePolicy, "addCommonNameAsDnsSan")) {
    await knex.schema.alterTable(TableName.PkiCertificatePolicy, (t) => {
      t.dropColumn("addCommonNameAsDnsSan");
    });
  }
}
