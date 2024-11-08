import { Knex } from 'knex';

import { TableName } from '../schemas';

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(
    TableName.ConsumerCredentials,
  );
  if (!isTablePresent) {
    await knex.schema.createTable(TableName.ConsumerCredentials, (t) => {
      t.uuid('id', { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid('userId').notNullable();
      t.foreign('userId')
        .references('id')
        .inTable(TableName.Users)
        .onDelete('CASCADE');
      t.string('type').notNullable(); // e.g., 'web_login', 'credit_card', 'secure_note'
      t.string('name').notNullable(); // e.g., 'My Bank Login', 'Personal Credit Card'
      t.jsonb('fields').notNullable(); // JSON object to store various fields based on type
      t.timestamps(true, true); // created_at and updated_at timestamps
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ConsumerCredentials);
}
