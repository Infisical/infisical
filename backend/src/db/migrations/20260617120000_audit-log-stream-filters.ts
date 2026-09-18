import { Knex } from "knex";

import { TableName } from "../schemas";

const FILTERS_COLUMN = "filters";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AuditLogStream)) {
    const hasFilters = await knex.schema.hasColumn(TableName.AuditLogStream, FILTERS_COLUMN);

    if (!hasFilters) {
      // Structured jsonb describing which audit logs the stream should receive, e.g.
      //   { "products": ["cert-manager", "organization"] }
      // NULL (the default for every existing stream) means "stream everything", so the change is
      // backwards compatible — no behavior change until a filter is explicitly configured. Modeled
      // as jsonb (not text[]) so future filter dimensions can be added without another migration.
      await knex.schema.alterTable(TableName.AuditLogStream, (t) => {
        t.jsonb(FILTERS_COLUMN).nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AuditLogStream)) {
    const hasFilters = await knex.schema.hasColumn(TableName.AuditLogStream, FILTERS_COLUMN);

    if (hasFilters) {
      await knex.schema.alterTable(TableName.AuditLogStream, (t) => {
        t.dropColumn(FILTERS_COLUMN);
      });
    }
  }
}
