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
      t.uuid('org_id').notNullable();
      t.string('project_id').notNullable();
      t.foreign('user_id')
        .references('id')
        .inTable(TableName.Users)
        .onDelete('CASCADE');
      t.foreign('org_id')
        .references('id')
        .inTable(TableName.Organization)
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

  const isInternalConsumerSecretsKmsKeyVersionTablePresent =
    await knex.schema.hasTable('internal_consumer_secrets_kms_key_version');
  if (!isInternalConsumerSecretsKmsKeyVersionTablePresent) {
    await knex.schema.createTable(
      'internal_consumer_secrets_kms_key_version',
      (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.specificType('encryptedKey', 'bytea').notNullable();
        t.integer('version').notNullable();
        t.uuid('internalKmsId').notNullable();
      },
    );
  }

  const isInternalConsumerSecretsKmsTablePresent = await knex.schema.hasTable(
    'internal_consumer_secrets_kms',
  );
  if (!isInternalConsumerSecretsKmsTablePresent) {
    await knex.schema.createTable('internal_consumer_secrets_kms', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.specificType('encryptedKey', 'bytea').notNullable();
      t.string('encryptionAlgorithm', 255).notNullable();
      t.integer('version').defaultTo(1).notNullable();
      t.uuid('kmsKeyId').notNullable().unique();
    });
  }

  const isExternalConsumerSecretsKmsTablePresent = await knex.schema.hasTable(
    'external_consumer_secrets_kms',
  );
  if (!isExternalConsumerSecretsKmsTablePresent) {
    await knex.schema.createTable('external_consumer_secrets_kms', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.string('provider', 255).notNullable();
      t.specificType('encryptedProviderInputs', 'bytea').notNullable();
      t.string('status', 255).nullable();
      t.string('statusDetails', 255).nullable();
      t.uuid('kmsKeyId').notNullable().unique();
    });
  }

  const isConsumerSecretsKmsRootConfigTablePresent = await knex.schema.hasTable(
    'consumer_secrets_kms_root_config',
  );
  if (!isConsumerSecretsKmsRootConfigTablePresent) {
    await knex.schema.createTable('consumer_secrets_kms_root_config', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.specificType('encryptedRootKey', 'bytea').notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('consumer_secrets_kms_root_config');
  await knex.schema.dropTableIfExists('external_consumer_secrets_kms');
  await knex.schema.dropTableIfExists('internal_consumer_secrets_kms');
  await knex.schema.dropTableIfExists(
    'internal_consumer_secrets_kms_key_version',
  );
  await knex.schema.dropTableIfExists(TableName.ConsumerSecrets);
}
