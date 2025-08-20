import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasMigratingFromColumn = await knex.schema.hasColumn(TableName.Organization, "migratingFrom");

  const hasConversationTable = await knex.schema.hasTable(TableName.Conversation);
  const hasConversationMessagesTable = await knex.schema.hasTable(TableName.ConversationMessages);

  if (!hasConversationTable) {
    await knex.schema.createTable(TableName.Conversation, (table) => {
      table.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      table.string("organizationId").notNullable();
      table.string("userId").notNullable();

      table.timestamps(true, true, true);
    });
  }

  if (!hasConversationMessagesTable) {
    await knex.schema.createTable(TableName.ConversationMessages, (table) => {
      table.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      table.text("message").notNullable();
      table.string("senderType").notNullable();

      table.uuid("conversationId").notNullable();
      table.foreign("conversationId").references("id").inTable(TableName.Conversation).onDelete("SET NULL");

      table.timestamps(true, true, true);
    });
  }

  if (!hasMigratingFromColumn) {
    await knex.schema.alterTable(TableName.Organization, (table) => {
      table.string("migratingFrom").nullable();
    });
  }

  await createOnUpdateTrigger(knex, TableName.Conversation);
  await createOnUpdateTrigger(knex, TableName.ConversationMessages);
}

export async function down(knex: Knex): Promise<void> {
  const hasMigratingFromColumn = await knex.schema.hasColumn(TableName.Organization, "migratingFrom");

  if (hasMigratingFromColumn) {
    await knex.schema.alterTable(TableName.Organization, (table) => {
      table.dropColumn("migratingFrom");
    });
  }

  await dropOnUpdateTrigger(knex, TableName.Conversation);
  await dropOnUpdateTrigger(knex, TableName.ConversationMessages);
  await knex.schema.dropTableIfExists(TableName.ConversationMessages);
  await knex.schema.dropTableIfExists(TableName.Conversation);
}
