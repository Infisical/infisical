import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AuditLog, "actorMetadata")) {
    await knex.raw(
      `CREATE INDEX "audit_logs_actorMetadata_idx" ON ${TableName.AuditLog} USING gin("actorMetadata" jsonb_path_ops)`
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS "audit_logs_actorMetadata_idx"`);
}
