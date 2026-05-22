import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.HoneyTokenConfig))) {
    await knex.schema.createTable(TableName.HoneyTokenConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("type").notNullable();
      t.uuid("connectionId").notNullable();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection);
      t.string("status").notNullable().defaultTo("VERIFICATION_PENDING");
      t.binary("encryptedConfig");
      t.timestamps(true, true, true);
      t.unique(["orgId", "type"]);
    });

    await createOnUpdateTrigger(knex, TableName.HoneyTokenConfig);
  }

  if (!(await knex.schema.hasTable(TableName.HoneyToken))) {
    await knex.schema.createTable(TableName.HoneyToken, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 64).notNullable();
      t.string("description", 256).nullable();
      t.string("type").notNullable();
      t.string("status").notNullable().defaultTo("active");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("folderId").notNullable();
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.binary("encryptedCredentials").notNullable();
      t.jsonb("secretsMapping").notNullable();
      t.string("tokenIdentifier", 256).nullable();
      t.unique(["tokenIdentifier"]);
      t.datetime("lastTriggeredAt").nullable();
      t.datetime("lastResetAt").nullable();
      t.datetime("revokedAt").nullable();
      t.uuid("createdByUserId").nullable();
      t.foreign("createdByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.uuid("resetByUserId").nullable();
      t.foreign("resetByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.uuid("revokedByUserId").nullable();
      t.foreign("revokedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.timestamps(true, true, true);
      t.unique(["name", "folderId"]);
    });

    await createOnUpdateTrigger(knex, TableName.HoneyToken);
  }

  if (!(await knex.schema.hasTable(TableName.HoneyTokenEvent))) {
    await knex.schema.createTable(TableName.HoneyTokenEvent, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("honeyTokenId").notNullable();
      t.foreign("honeyTokenId").references("id").inTable(TableName.HoneyToken).onDelete("CASCADE");
      t.string("eventType").notNullable();
      t.jsonb("metadata");
      t.timestamps(true, true, true);
      t.index(["honeyTokenId", "createdAt"]);
    });

    await createOnUpdateTrigger(knex, TableName.HoneyTokenEvent);
  }

  if (!(await knex.schema.hasTable(TableName.HoneyTokenSecretMapping))) {
    await knex.schema.createTable(TableName.HoneyTokenSecretMapping, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("secretId").notNullable().unique();
      t.foreign("secretId").references("id").inTable(TableName.SecretV2).onDelete("CASCADE");
      t.uuid("honeyTokenId").notNullable();
      t.foreign("honeyTokenId").references("id").inTable(TableName.HoneyToken).onDelete("CASCADE");
      t.unique(["honeyTokenId", "secretId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.HoneyTokenSecretMapping);
  await knex.schema.dropTableIfExists(TableName.HoneyTokenEvent);
  await dropOnUpdateTrigger(knex, TableName.HoneyTokenEvent);
  await knex.schema.dropTableIfExists(TableName.HoneyToken);
  await dropOnUpdateTrigger(knex, TableName.HoneyToken);
  await knex.schema.dropTableIfExists(TableName.HoneyTokenConfig);
  await dropOnUpdateTrigger(knex, TableName.HoneyTokenConfig);
}
