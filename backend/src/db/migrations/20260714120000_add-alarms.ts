import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Alarm))) {
    await knex.schema.createTable(TableName.Alarm, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.text("description").nullable();
      t.string("resourceType").notNullable();
      t.string("resourceId").nullable();
      t.string("eventType").notNullable();
      t.jsonb("condition").nullable();
      t.jsonb("filters").nullable();
      t.boolean("enabled").notNullable().defaultTo(true);
      t.uuid("orgId").notNullable();
      t.string("projectId").nullable();
      t.uuid("createdByUserId").nullable();
      t.timestamps(true, true, true);

      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.foreign("createdByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.index("orgId");
      t.index("projectId");
      t.index("createdByUserId");
      t.index(["resourceType", "enabled"]);
    });
  }

  if (!(await knex.schema.hasTable(TableName.AlarmRecipient))) {
    await knex.schema.createTable(TableName.AlarmRecipient, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("alarmId").notNullable();
      t.string("principalType").notNullable();
      t.string("principalId").notNullable();
      t.timestamps(true, true, true);

      t.foreign("alarmId").references("id").inTable(TableName.Alarm).onDelete("CASCADE");
      t.index("alarmId");
      t.unique(["alarmId", "principalType", "principalId"]);
    });
  }

  if (!(await knex.schema.hasTable(TableName.AlarmChannel))) {
    await knex.schema.createTable(TableName.AlarmChannel, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("alarmId").notNullable();
      t.string("channelType").notNullable();
      t.binary("encryptedConfig").notNullable();
      t.boolean("enabled").notNullable().defaultTo(true);
      t.timestamps(true, true, true);

      t.foreign("alarmId").references("id").inTable(TableName.Alarm).onDelete("CASCADE");
      t.index("alarmId");
    });
  }

  if (!(await knex.schema.hasTable(TableName.AlarmHistory))) {
    await knex.schema.createTable(TableName.AlarmHistory, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("alarmId").notNullable();
      // Not notNullable: the now() default is applied DB-side, and keeping it nullable lets the
      // generated Insert type treat it as optional (matching pki_alert_history).
      t.timestamp("triggeredAt").defaultTo(knex.fn.now());
      t.string("status").notNullable();
      t.text("error").nullable();
      t.timestamps(true, true, true);

      t.foreign("alarmId").references("id").inTable(TableName.Alarm).onDelete("CASCADE");
      // Covers the FK plus the dedup lookup: recent runs for an alarm within the window. The run-level
      // status column (success | partial | failed) is audit-only; per-(channel, target) success
      // filtering happens on alarm_history_target, so status is not part of this index.
      t.index(["alarmId", "triggeredAt"]);
    });
  }

  if (!(await knex.schema.hasTable(TableName.AlarmHistoryTarget))) {
    await knex.schema.createTable(TableName.AlarmHistoryTarget, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("alarmHistoryId").notNullable();
      t.string("targetId").notNullable();
      // Dedup is scoped per (channel, target): a broken channel re-fires only its own targets while
      // channels that already delivered are never re-notified. channelId is nullable (SET NULL) so a
      // delivery record survives channel deletion; channelType is retained for display when it does.
      t.uuid("channelId").nullable();
      t.string("channelType").notNullable();
      t.string("status").notNullable();
      t.timestamps(true, true, true);

      t.foreign("alarmHistoryId").references("id").inTable(TableName.AlarmHistory).onDelete("CASCADE");
      t.foreign("channelId").references("id").inTable(TableName.AlarmChannel).onDelete("SET NULL");
      // Serves the dedup lookup: join on alarmHistoryId, filter status=success + targetId IN (...).
      t.index(["alarmHistoryId", "targetId"]);
      t.index("channelId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AlarmHistoryTarget)) {
    await knex.schema.dropTable(TableName.AlarmHistoryTarget);
  }
  if (await knex.schema.hasTable(TableName.AlarmHistory)) {
    await knex.schema.dropTable(TableName.AlarmHistory);
  }
  if (await knex.schema.hasTable(TableName.AlarmChannel)) {
    await knex.schema.dropTable(TableName.AlarmChannel);
  }
  if (await knex.schema.hasTable(TableName.AlarmRecipient)) {
    await knex.schema.dropTable(TableName.AlarmRecipient);
  }
  if (await knex.schema.hasTable(TableName.Alarm)) {
    await knex.schema.dropTable(TableName.Alarm);
  }
}
