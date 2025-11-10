import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiAlertsV2))) {
    await knex.schema.createTable(TableName.PkiAlertsV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.text("description").nullable();
      t.string("eventType").notNullable();
      t.string("alertBefore").nullable();
      t.jsonb("filters").nullable();
      t.boolean("enabled").defaultTo(true);
      t.string("projectId").notNullable();
      t.timestamps(true, true, true);

      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");
      t.unique(["name", "projectId"]);
    });
  }

  if (!(await knex.schema.hasTable(TableName.PkiAlertChannels))) {
    await knex.schema.createTable(TableName.PkiAlertChannels, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("alertId").notNullable();
      t.string("channelType").notNullable();
      t.jsonb("config").notNullable();
      t.boolean("enabled").defaultTo(true);
      t.timestamps(true, true, true);

      t.foreign("alertId").references("id").inTable(TableName.PkiAlertsV2).onDelete("CASCADE");
      t.index("alertId");
      t.index("channelType");
      t.index("enabled");
    });
  }

  if (!(await knex.schema.hasTable(TableName.PkiAlertHistory))) {
    await knex.schema.createTable(TableName.PkiAlertHistory, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("alertId").notNullable();
      t.timestamp("triggeredAt").defaultTo(knex.fn.now());
      t.boolean("hasNotificationSent").defaultTo(false);
      t.text("notificationError").nullable();
      t.timestamps(true, true, true);

      t.foreign("alertId").references("id").inTable(TableName.PkiAlertsV2).onDelete("CASCADE");
      t.index("alertId");
      t.index("triggeredAt");
    });
  }

  if (!(await knex.schema.hasTable(TableName.PkiAlertHistoryCertificate))) {
    await knex.schema.createTable(TableName.PkiAlertHistoryCertificate, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("alertHistoryId").notNullable();
      t.uuid("certificateId").notNullable();
      t.timestamps(true, true, true);

      t.foreign("alertHistoryId").references("id").inTable(TableName.PkiAlertHistory).onDelete("CASCADE");
      t.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("CASCADE");
      t.index("alertHistoryId");
      t.index("certificateId");
      t.unique(["alertHistoryId", "certificateId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAlertHistoryCertificate)) {
    await knex.schema.dropTable(TableName.PkiAlertHistoryCertificate);
  }

  if (await knex.schema.hasTable(TableName.PkiAlertHistory)) {
    await knex.schema.dropTable(TableName.PkiAlertHistory);
  }

  if (await knex.schema.hasTable(TableName.PkiAlertChannels)) {
    await knex.schema.dropTable(TableName.PkiAlertChannels);
  }

  if (await knex.schema.hasTable(TableName.PkiAlertsV2)) {
    await knex.schema.dropTable(TableName.PkiAlertsV2);
  }
}
