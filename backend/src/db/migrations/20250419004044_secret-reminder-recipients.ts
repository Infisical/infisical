import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasSecretReminderRecipientsTable = await knex.schema.hasTable(TableName.SecretReminderRecipients);

  if (!hasSecretReminderRecipientsTable) {
    await knex.schema.createTable(TableName.SecretReminderRecipients, (table) => {
      table.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      table.timestamps(true, true, true);
      table.uuid("secretId").notNullable();
      table.uuid("userId").notNullable();
      table.string("projectId").notNullable();

      // Based on userId rather than project membership ID so we can easily extend group support in the future if need be.
      // This does however mean we need to manually clean up once a user is removed from a project.
      table.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      table.foreign("secretId").references("id").inTable(TableName.SecretV2).onDelete("CASCADE");
      table.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      table.index("secretId");
      table.unique(["secretId", "userId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSecretReminderRecipientsTable = await knex.schema.hasTable(TableName.SecretReminderRecipients);

  if (hasSecretReminderRecipientsTable) {
    await knex.schema.dropTableIfExists(TableName.SecretReminderRecipients);
  }
}
