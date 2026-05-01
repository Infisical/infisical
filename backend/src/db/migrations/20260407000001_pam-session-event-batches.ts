import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PamSessionEventBatch))) {
    await knex.schema.createTable(TableName.PamSessionEventBatch, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("sessionId").notNullable();
      t.foreign("sessionId").references("id").inTable(TableName.PamSession).onDelete("CASCADE");
      t.index("sessionId");

      t.bigInteger("startOffset").notNullable();
      t.binary("encryptedEventsBlob").notNullable();

      t.timestamps(true, true, true);

      t.unique(["sessionId", "startOffset"]);
    });

    await createOnUpdateTrigger(knex, TableName.PamSessionEventBatch);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.PamSessionEventBatch);
  await knex.schema.dropTableIfExists(TableName.PamSessionEventBatch);
}
