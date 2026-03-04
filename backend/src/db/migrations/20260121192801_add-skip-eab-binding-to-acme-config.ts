import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAcmeEnrollmentConfig)) {
    if (!(await knex.schema.hasColumn(TableName.PkiAcmeEnrollmentConfig, "skipEabBinding"))) {
      await knex.schema.alterTable(TableName.PkiAcmeEnrollmentConfig, (t) => {
        t.boolean("skipEabBinding").defaultTo(false).notNullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAcmeEnrollmentConfig)) {
    if (await knex.schema.hasColumn(TableName.PkiAcmeEnrollmentConfig, "skipEabBinding")) {
      await knex.schema.alterTable(TableName.PkiAcmeEnrollmentConfig, (t) => {
        t.dropColumn("skipEabBinding");
      });
    }
  }
}
