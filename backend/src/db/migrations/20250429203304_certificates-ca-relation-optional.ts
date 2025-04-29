import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Certificate)) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.uuid("caId").nullable().alter();
      t.uuid("caCertId").nullable().alter();
    });
  }
}

export async function down(): Promise<void> {
  // Altering back to nullable will fail
}
