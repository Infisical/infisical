import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Certificate, "extendedKeyUsages"))) return;

  await knex.raw(
    `UPDATE "${TableName.Certificate}" SET "extendedKeyUsages" = array_remove("extendedKeyUsages", NULL::text) WHERE array_position("extendedKeyUsages", NULL::text) IS NOT NULL`
  );
}

export async function down(): Promise<void> {
  // The removed elements carried no value, so there is nothing to restore.
}
