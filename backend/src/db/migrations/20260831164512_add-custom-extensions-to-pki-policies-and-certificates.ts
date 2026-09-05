import { Knex } from "knex";

import { TableName } from "../schemas";

const TABLES_WITH_CUSTOM_EXTENSIONS = [
  TableName.PkiCertificatePolicy,
  TableName.CertificateRequests,
  TableName.Certificate
] as const;

export async function up(knex: Knex): Promise<void> {
  for await (const tableName of TABLES_WITH_CUSTOM_EXTENSIONS) {
    if (await knex.schema.hasTable(tableName)) {
      if (!(await knex.schema.hasColumn(tableName, "customExtensions"))) {
        await knex.schema.alterTable(tableName, (t) => {
          t.jsonb("customExtensions");
        });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  for await (const tableName of TABLES_WITH_CUSTOM_EXTENSIONS) {
    if (await knex.schema.hasTable(tableName)) {
      if (await knex.schema.hasColumn(tableName, "customExtensions")) {
        await knex.schema.alterTable(tableName, (t) => {
          t.dropColumn("customExtensions");
        });
      }
    }
  }
}
