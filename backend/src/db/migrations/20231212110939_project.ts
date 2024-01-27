import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Project))) {
    await knex.schema.createTable(TableName.Project, (t) => {
      t.string("id", 36).primary().defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("slug").notNullable();
      t.boolean("autoCapitalization").defaultTo(true);
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.unique(["orgId", "slug"]);
    });
  }
  await createOnUpdateTrigger(knex, TableName.Project);
  // environments
  if (!(await knex.schema.hasTable(TableName.Environment))) {
    await knex.schema.createTable(TableName.Environment, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("slug").notNullable();
      t.integer("position").notNullable();
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      // this will ensure ever env has its position
      t.unique(["projectId", "position"], {
        indexName: "env_pos_composite_uniqe",
        deferrable: "deferred"
      });
      t.timestamps(true, true, true);
    });
  }
  // project key
  if (!(await knex.schema.hasTable(TableName.ProjectKeys))) {
    await knex.schema.createTable(TableName.ProjectKeys, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.text("encryptedKey").notNullable();
      t.text("nonce").notNullable();
      t.uuid("receiverId").notNullable();
      t.foreign("receiverId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("senderId");
      // if sender is deleted just don't do anything to this record
      t.foreign("senderId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.ProjectKeys);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.Environment);
  await knex.schema.dropTableIfExists(TableName.ProjectKeys);
  await knex.schema.dropTableIfExists(TableName.Project);
  await dropOnUpdateTrigger(knex, TableName.ProjectKeys);
  await dropOnUpdateTrigger(knex, TableName.Project);
}
