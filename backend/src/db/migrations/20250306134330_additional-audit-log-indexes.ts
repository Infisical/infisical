import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasEventTypeCol = await knex.schema.hasColumn(TableName.AuditLog, "eventType");
  const hasEventMetadataCol = await knex.schema.hasColumn(TableName.AuditLog, "eventMetadata");
  const hasUserAgentTypeCol = await knex.schema.hasColumn(TableName.AuditLog, "userAgentType");

  await knex.schema.alterTable(TableName.AuditLog, (t) => {
    if (hasEventTypeCol) t.index("eventType");
    if (hasUserAgentTypeCol) t.index("userAgentType");
  });

  if (hasEventMetadataCol) {
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_audit_logs_secret_path
      ON audit_logs ("projectId", ("eventMetadata"->>'secretPath'), "createdAt" DESC);`);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasEventTypeCol = await knex.schema.hasColumn(TableName.AuditLog, "eventType");
  const hasEventMetadataCol = await knex.schema.hasColumn(TableName.AuditLog, "eventMetadata");
  const hasUserAgentTypeCol = await knex.schema.hasColumn(TableName.AuditLog, "userAgentType");

  await knex.schema.alterTable(TableName.AuditLog, (t) => {
    if (hasEventTypeCol) t.dropIndex("eventType");
    if (hasUserAgentTypeCol) t.dropIndex("userAgentType");
  });

  if (hasEventMetadataCol) {
    await knex.raw(`DROP INDEX IF EXISTS idx_audit_logs_secret_path`);
  }
}
