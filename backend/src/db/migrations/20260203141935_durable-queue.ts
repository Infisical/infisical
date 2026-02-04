import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

// TODO(dq): add index
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.QueueJobs);
  if (!hasTable) {
    await knex.schema.createTable(TableName.QueueJobs, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("queueName").notNullable();
      // helps in golang migration
      t.string("queueType").notNullable().defaultTo("bullmq");
      t.string("queueJobName").notNullable();
      t.string("jobId").notNullable();
      t.json("queueData").notNullable();
      t.string("status").notNullable().defaultTo("pending");

      t.integer("attempts").notNullable().defaultTo(0);
      t.integer("maxAttempts").notNullable().defaultTo(3);
      t.string("errorMessage", 1000);
      t.datetime("lastHeartBeat");
      t.datetime("startedAt");
      t.datetime("completedAt");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.QueueJobs);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.QueueJobs);
  if (hasTable) await knex.schema.dropTable(TableName.QueueJobs);
  await dropOnUpdateTrigger(knex, TableName.QueueJobs);
}
