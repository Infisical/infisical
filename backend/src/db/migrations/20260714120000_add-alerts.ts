import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Alert))) {
    await knex.schema.createTable(TableName.Alert, (t) => {
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

    await createOnUpdateTrigger(knex, TableName.Alert);
  }

  // Channels are standalone, reusable delivery destinations scoped to an org (projectId null) or a
  // project. Alerts reference them through alert_channel_memberships, so editing a channel's config
  // (including clearing an optional secret) is a first-class operation independent of any alert.
  if (!(await knex.schema.hasTable(TableName.AlertChannel))) {
    await knex.schema.createTable(TableName.AlertChannel, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("channelType").notNullable();
      t.binary("encryptedConfig").notNullable();
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
    });

    await createOnUpdateTrigger(knex, TableName.AlertChannel);
  }

  // Recipients belong to the channel (directed channels such as Email), so a shared channel is
  // self-contained and every alert that references it notifies the same list.
  if (!(await knex.schema.hasTable(TableName.AlertChannelRecipient))) {
    await knex.schema.createTable(TableName.AlertChannelRecipient, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("channelId").notNullable();
      t.string("principalType").notNullable();
      t.string("principalId").notNullable();
      t.timestamps(true, true, true);

      t.foreign("channelId").references("id").inTable(TableName.AlertChannel).onDelete("CASCADE");
      t.index("channelId");
      t.unique(["channelId", "principalType", "principalId"]);
    });

    await createOnUpdateTrigger(knex, TableName.AlertChannelRecipient);
  }

  // Many-to-many between alerts and channels. The count of rows for a channel powers the "used by N
  // alerts" column in the UI.
  if (!(await knex.schema.hasTable(TableName.AlertChannelMembership))) {
    await knex.schema.createTable(TableName.AlertChannelMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("alertId").notNullable();
      t.uuid("channelId").notNullable();
      t.timestamps(true, true, true);

      t.foreign("alertId").references("id").inTable(TableName.Alert).onDelete("CASCADE");
      t.foreign("channelId").references("id").inTable(TableName.AlertChannel).onDelete("CASCADE");
      t.index("alertId");
      t.index("channelId");
      t.unique(["alertId", "channelId"]);
    });

    await createOnUpdateTrigger(knex, TableName.AlertChannelMembership);
  }

  if (!(await knex.schema.hasTable(TableName.AlertHistory))) {
    await knex.schema.createTable(TableName.AlertHistory, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("alertId").notNullable();
      // Not notNullable: the now() default is applied DB-side, and keeping it nullable lets the
      // generated Insert type treat it as optional (matching pki_alert_history).
      t.timestamp("triggeredAt").defaultTo(knex.fn.now());
      t.string("status").notNullable();
      t.text("error").nullable();
      t.timestamps(true, true, true);

      t.foreign("alertId").references("id").inTable(TableName.Alert).onDelete("CASCADE");
      // Covers the FK plus the dedup lookup: recent runs for an alert within the window. The run-level
      // status column (success | partial | failed) is audit-only; per-(channel, target) success
      // filtering happens on alert_history_target, so status is not part of this index.
      t.index(["alertId", "triggeredAt"]);
    });

    await createOnUpdateTrigger(knex, TableName.AlertHistory);
  }

  if (!(await knex.schema.hasTable(TableName.AlertHistoryTarget))) {
    await knex.schema.createTable(TableName.AlertHistoryTarget, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("alertHistoryId").notNullable();
      t.string("targetId").notNullable();
      // Dedup is scoped per (channel, target): a broken channel re-fires only its own targets while
      // channels that already delivered are never re-notified. channelId is nullable (SET NULL) so a
      // delivery record survives channel deletion; channelType is retained for display when it does.
      t.uuid("channelId").nullable();
      t.string("channelType").notNullable();
      t.string("status").notNullable();
      t.timestamps(true, true, true);

      t.foreign("alertHistoryId").references("id").inTable(TableName.AlertHistory).onDelete("CASCADE");
      t.foreign("channelId").references("id").inTable(TableName.AlertChannel).onDelete("SET NULL");
      // Serves the dedup lookup: join on alertHistoryId, filter status=success + targetId IN (...).
      t.index(["alertHistoryId", "targetId"]);
      t.index("channelId");
    });

    await createOnUpdateTrigger(knex, TableName.AlertHistoryTarget);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AlertHistoryTarget)) {
    await dropOnUpdateTrigger(knex, TableName.AlertHistoryTarget);
    await knex.schema.dropTable(TableName.AlertHistoryTarget);
  }
  if (await knex.schema.hasTable(TableName.AlertHistory)) {
    await dropOnUpdateTrigger(knex, TableName.AlertHistory);
    await knex.schema.dropTable(TableName.AlertHistory);
  }
  if (await knex.schema.hasTable(TableName.AlertChannelMembership)) {
    await dropOnUpdateTrigger(knex, TableName.AlertChannelMembership);
    await knex.schema.dropTable(TableName.AlertChannelMembership);
  }
  if (await knex.schema.hasTable(TableName.AlertChannelRecipient)) {
    await dropOnUpdateTrigger(knex, TableName.AlertChannelRecipient);
    await knex.schema.dropTable(TableName.AlertChannelRecipient);
  }
  if (await knex.schema.hasTable(TableName.AlertChannel)) {
    await dropOnUpdateTrigger(knex, TableName.AlertChannel);
    await knex.schema.dropTable(TableName.AlertChannel);
  }
  if (await knex.schema.hasTable(TableName.Alert)) {
    await dropOnUpdateTrigger(knex, TableName.Alert);
    await knex.schema.dropTable(TableName.Alert);
  }
}
