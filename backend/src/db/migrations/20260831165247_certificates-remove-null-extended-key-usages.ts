import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Certificate, "extendedKeyUsages")) {
    await knex(TableName.Certificate)
      .whereRaw(`array_position("extendedKeyUsages", NULL::text) IS NOT NULL`)
      .update({
        extendedKeyUsages: knex.raw(`array_remove("extendedKeyUsages", NULL::text)`)
      });
  }
}

export async function down(): Promise<void> {
  // The removed elements carried no value, so there is nothing to restore.
}
