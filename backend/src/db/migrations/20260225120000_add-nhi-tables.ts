import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // nhi_sources — cloud account connections
  if (!(await knex.schema.hasTable(TableName.NhiSource))) {
    await knex.schema.createTable(TableName.NhiSource, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("name").notNullable();
      t.string("provider").notNullable();
      t.uuid("connectionId").nullable();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection).onDelete("SET NULL");
      t.string("lastScanStatus").nullable();
      t.string("lastScanMessage").nullable();
      t.datetime("lastScannedAt").nullable();
      t.integer("lastIdentitiesFound").nullable();
      t.timestamps(true, true, true);
      t.unique(["projectId", "name"]);
    });
    await createOnUpdateTrigger(knex, TableName.NhiSource);
  }

  // nhi_identities — discovered non-human identities
  if (!(await knex.schema.hasTable(TableName.NhiIdentity))) {
    await knex.schema.createTable(TableName.NhiIdentity, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("sourceId").notNullable();
      t.foreign("sourceId").references("id").inTable(TableName.NhiSource).onDelete("CASCADE");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("externalId").notNullable();
      t.string("name").notNullable();
      t.string("type").notNullable();
      t.string("provider").notNullable();
      t.jsonb("metadata").notNullable();
      t.integer("riskScore").notNullable().defaultTo(0);
      t.jsonb("riskFactors").notNullable().defaultTo("[]");
      t.string("ownerEmail").nullable();
      t.string("status").notNullable().defaultTo("active");
      t.datetime("lastActivityAt").nullable();
      t.datetime("lastSeenAt").notNullable().defaultTo(knex.fn.now());
      t.timestamps(true, true, true);
      t.unique(["sourceId", "externalId"]);
    });
    await createOnUpdateTrigger(knex, TableName.NhiIdentity);
  }

  // nhi_scans — scan run history
  if (!(await knex.schema.hasTable(TableName.NhiScan))) {
    await knex.schema.createTable(TableName.NhiScan, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("sourceId").notNullable();
      t.foreign("sourceId").references("id").inTable(TableName.NhiSource).onDelete("CASCADE");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("status").notNullable();
      t.string("statusMessage").nullable();
      t.integer("identitiesFound").nullable();
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.NhiScan);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.NhiScan);
  await dropOnUpdateTrigger(knex, TableName.NhiScan);

  await knex.schema.dropTableIfExists(TableName.NhiIdentity);
  await dropOnUpdateTrigger(knex, TableName.NhiIdentity);

  await knex.schema.dropTableIfExists(TableName.NhiSource);
  await dropOnUpdateTrigger(knex, TableName.NhiSource);
}
