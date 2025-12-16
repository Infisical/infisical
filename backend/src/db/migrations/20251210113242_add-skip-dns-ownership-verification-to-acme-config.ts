import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAcmeEnrollmentConfig)) {
    if (!(await knex.schema.hasColumn(TableName.PkiAcmeEnrollmentConfig, "skipDnsOwnershipVerification"))) {
      await knex.schema.alterTable(TableName.PkiAcmeEnrollmentConfig, (t) => {
        t.boolean("skipDnsOwnershipVerification").defaultTo(false).notNullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAcmeEnrollmentConfig)) {
    if (await knex.schema.hasColumn(TableName.PkiAcmeEnrollmentConfig, "skipDnsOwnershipVerification")) {
      await knex.schema.alterTable(TableName.PkiAcmeEnrollmentConfig, (t) => {
        t.dropColumn("skipDnsOwnershipVerification");
      });
    }
  }
}
