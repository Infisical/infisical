import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CertificateCleanupConfig))) {
    await knex.schema.createTable(TableName.CertificateCleanupConfig, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("projectId").notNullable().unique();
      tb.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      tb.boolean("isEnabled").notNullable().defaultTo(false);
      tb.integer("daysBeforeDeletion").notNullable().defaultTo(3);
      tb.boolean("includeRevokedCertificates").notNullable().defaultTo(false);
      tb.boolean("skipCertsWithActiveSyncs").notNullable().defaultTo(true);
      tb.string("lastRunStatus");
      tb.datetime("lastRunAt");
      tb.integer("lastRunCertsDeleted").notNullable().defaultTo(0);
      tb.text("lastRunMessage");
      tb.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.CertificateCleanupConfig);
  }

  const indexExists = await knex.raw(`SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ?`, [
    TableName.Certificate,
    "idx_certificates_status_not_after"
  ]);
  if (indexExists.rows.length === 0) {
    await knex.schema.alterTable(TableName.Certificate, (tb) => {
      tb.index(["status", "notAfter"], "idx_certificates_status_not_after");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.CertificateCleanupConfig);
  await dropOnUpdateTrigger(knex, TableName.CertificateCleanupConfig);

  if (await knex.schema.hasTable(TableName.Certificate)) {
    const indexExists = await knex.raw(`SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ?`, [
      TableName.Certificate,
      "idx_certificates_status_not_after"
    ]);
    if (indexExists.rows.length > 0) {
      await knex.schema.alterTable(TableName.Certificate, (tb) => {
        tb.dropIndex(["status", "notAfter"], "idx_certificates_status_not_after");
      });
    }
  }
}
