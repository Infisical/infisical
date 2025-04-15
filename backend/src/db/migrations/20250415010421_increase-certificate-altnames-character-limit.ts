import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Certificate, (t) => {
    t.string("altNames", 4096).alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Certificate, (t) => {
    t.string("altNames").alter(); // Defaults to varchar(255)
  });
}
