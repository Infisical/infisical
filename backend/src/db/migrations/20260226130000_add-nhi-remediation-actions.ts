import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.NhiRemediationAction))) {
    await knex.schema.createTable(TableName.NhiRemediationAction, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.NhiIdentity).onDelete("CASCADE");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("sourceId").notNullable();
      t.foreign("sourceId").references("id").inTable(TableName.NhiSource).onDelete("CASCADE");
      t.string("actionType").notNullable();
      t.string("status").notNullable().defaultTo("pending");
      t.string("statusMessage").nullable();
      t.string("triggeredBy").notNullable();
      t.string("riskFactor").nullable();
      t.jsonb("metadata").notNullable().defaultTo("{}");
      t.datetime("completedAt").nullable();
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.NhiRemediationAction);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.NhiRemediationAction);
  await dropOnUpdateTrigger(knex, TableName.NhiRemediationAction);
}
