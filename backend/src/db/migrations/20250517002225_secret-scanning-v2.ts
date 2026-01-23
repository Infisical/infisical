import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";
import {
  SecretScanningFindingStatus,
  SecretScanningScanStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretScanningDataSource))) {
    await knex.schema.createTable(TableName.SecretScanningDataSource, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("externalId").index(); // if we need a unique way of identifying this data source from an external resource
      t.string("name", 48).notNullable();
      t.string("description");
      t.string("type").notNullable();
      t.jsonb("config").notNullable();
      t.binary("encryptedCredentials"); // webhook credentials, etc.
      t.uuid("connectionId");
      t.boolean("isAutoScanEnabled").defaultTo(true);
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.boolean("isDisconnected").notNullable().defaultTo(false);
      t.unique(["projectId", "name"]);
    });
    await createOnUpdateTrigger(knex, TableName.SecretScanningDataSource);
  }

  if (!(await knex.schema.hasTable(TableName.SecretScanningResource))) {
    await knex.schema.createTable(TableName.SecretScanningResource, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("externalId").notNullable();
      t.string("name").notNullable();
      t.string("type").notNullable();
      t.uuid("dataSourceId").notNullable();
      t.foreign("dataSourceId").references("id").inTable(TableName.SecretScanningDataSource).onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.unique(["dataSourceId", "externalId"]);
    });
    await createOnUpdateTrigger(knex, TableName.SecretScanningResource);
  }

  if (!(await knex.schema.hasTable(TableName.SecretScanningScan))) {
    await knex.schema.createTable(TableName.SecretScanningScan, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("status").notNullable().defaultTo(SecretScanningScanStatus.Queued);
      t.string("statusMessage", 1024);
      t.string("type").notNullable();
      t.uuid("resourceId").notNullable();
      t.foreign("resourceId").references("id").inTable(TableName.SecretScanningResource).onDelete("CASCADE");
      t.timestamp("createdAt").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable(TableName.SecretScanningFinding))) {
    await knex.schema.createTable(TableName.SecretScanningFinding, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("dataSourceName").notNullable();
      t.string("dataSourceType").notNullable();
      t.string("resourceName").notNullable();
      t.string("resourceType").notNullable();
      t.string("rule").notNullable();
      t.string("severity").notNullable();
      t.string("status").notNullable().defaultTo(SecretScanningFindingStatus.Unresolved);
      t.string("remarks");
      t.string("fingerprint").notNullable();
      t.jsonb("details").notNullable();
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("scanId");
      t.foreign("scanId").references("id").inTable(TableName.SecretScanningScan).onDelete("SET NULL");
      t.timestamps(true, true, true);
      t.unique(["projectId", "fingerprint"]);
    });
    await createOnUpdateTrigger(knex, TableName.SecretScanningFinding);
  }

  if (!(await knex.schema.hasTable(TableName.SecretScanningConfig))) {
    await knex.schema.createTable(TableName.SecretScanningConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable().unique();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("content", 5000);
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.SecretScanningConfig);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretScanningFinding);

  await dropOnUpdateTrigger(knex, TableName.SecretScanningFinding);
  await knex.schema.dropTableIfExists(TableName.SecretScanningScan);

  await knex.schema.dropTableIfExists(TableName.SecretScanningResource);
  await dropOnUpdateTrigger(knex, TableName.SecretScanningResource);

  await knex.schema.dropTableIfExists(TableName.SecretScanningDataSource);
  await dropOnUpdateTrigger(knex, TableName.SecretScanningDataSource);

  await knex.schema.dropTableIfExists(TableName.SecretScanningConfig);
  await dropOnUpdateTrigger(knex, TableName.SecretScanningConfig);
}
