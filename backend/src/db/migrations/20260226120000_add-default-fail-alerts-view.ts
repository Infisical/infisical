import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

const DEFAULT_FAIL_ALERTS_LAYOUT = JSON.stringify([
  {
    uid: "default-all-failures",
    tmpl: "all-failures",
    x: 0,
    y: 0,
    w: 6,
    h: 2
  },
  {
    uid: "default-secret-syncs",
    tmpl: "secret-syncs",
    x: 6,
    y: 0,
    w: 6,
    h: 2
  },
  {
    uid: "default-live-logs",
    tmpl: "logs",
    x: 0,
    y: 2,
    w: 12,
    h: 2
  }
]);

export async function up(knex: Knex): Promise<void> {
  const hasUserIdColumn = await knex.schema.hasColumn(TableName.ObservabilityWidgetView, "userId");

  if (hasUserIdColumn) {
    await knex.schema.alterTable(TableName.ObservabilityWidgetView, (t) => {
      t.uuid("userId").nullable().alter();
    });
  }

  const hasScopeColumn = await knex.schema.hasColumn(TableName.ObservabilityWidgetView, "scope");
  if (!hasScopeColumn) {
    await knex.schema.alterTable(TableName.ObservabilityWidgetView, (t) => {
      t.string("scope", 32).notNullable().defaultTo("organization");
    });
  }

  const hasIsDefaultColumn = await knex.schema.hasColumn(TableName.ObservabilityWidgetView, "isDefault");
  if (!hasIsDefaultColumn) {
    await knex.schema.alterTable(TableName.ObservabilityWidgetView, (t) => {
      t.boolean("isDefault").notNullable().defaultTo(false);
    });
  }

  const organizations = await knex(TableName.Organization).select("id");

  for (const org of organizations) {
    const existingDefaultView = await knex(TableName.ObservabilityWidgetView)
      .where({ orgId: org.id, name: "Fail alerts" })
      .first();

    if (!existingDefaultView) {
      await knex(TableName.ObservabilityWidgetView).insert({
        name: "Fail alerts",
        orgId: org.id,
        userId: null,
        scope: "organization",
        isDefault: true,
        items: DEFAULT_FAIL_ALERTS_LAYOUT
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex(TableName.ObservabilityWidgetView).where({ isDefault: true }).del();

  const hasIsDefaultColumn = await knex.schema.hasColumn(TableName.ObservabilityWidgetView, "isDefault");
  if (hasIsDefaultColumn) {
    await knex.schema.alterTable(TableName.ObservabilityWidgetView, (t) => {
      t.dropColumn("isDefault");
    });
  }

  const hasScopeColumn = await knex.schema.hasColumn(TableName.ObservabilityWidgetView, "scope");
  if (hasScopeColumn) {
    await knex.schema.alterTable(TableName.ObservabilityWidgetView, (t) => {
      t.dropColumn("scope");
    });
  }
}
