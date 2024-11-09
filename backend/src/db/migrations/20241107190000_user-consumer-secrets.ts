import { Knex } from 'knex';

import { TableName } from '../schemas';

export async function up(knex: Knex): Promise<void> {
  const isConsumerSecretsTablePresent = await knex.schema.hasTable(
    TableName.ConsumerSecrets,
  );
  if (!isConsumerSecretsTablePresent) {
    await knex.schema.createTable(TableName.ConsumerSecrets, (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('user_id').notNullable();
      t.string('project_id').notNullable();
      t.foreign('user_id')
        .references('id')
        .inTable(TableName.Users)
        .onDelete('CASCADE');
      t.foreign('project_id')
        .references('id')
        .inTable(TableName.Project)
        .onDelete('CASCADE');
      t.string('type').notNullable(); // e.g., 'web_login', 'credit_card', 'secure_note'
      t.string('name').notNullable();
      t.jsonb('fields').notNullable(); // JSON object to store various fields based on type
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ConsumerSecrets);
}
