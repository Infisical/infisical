import { Knex } from "knex";

import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const QUEUE_JOBS_TABLE = "queue_jobs";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(QUEUE_JOBS_TABLE);
  if (hasTable) {
    await knex.schema.dropTable(QUEUE_JOBS_TABLE);
    await dropOnUpdateTrigger(knex, QUEUE_JOBS_TABLE);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(QUEUE_JOBS_TABLE);
  if (!hasTable) {
    await knex.schema.createTable(QUEUE_JOBS_TABLE, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("queueName").notNullable();
      t.string("queueType").notNullable().defaultTo("bullmq");
      t.string("queueJobName").notNullable();
      t.string("jobId").notNullable();
      t.jsonb("queueData").notNullable();
      t.jsonb("queueOptions");
      t.string("status").notNullable().defaultTo("pending");

      t.integer("attempts").notNullable().defaultTo(0);
      t.integer("maxAttempts").notNullable().defaultTo(3);
      t.string("errorMessage", 1000);
      t.datetime("lastHeartBeat");
      t.datetime("startedAt");
      t.datetime("completedAt");
      t.timestamps(true, true, true);

      t.index(["queueName", "status", "createdAt"]);
      t.index(["jobId", "queueName"]);
      t.index(["status"]);
    });

    await createOnUpdateTrigger(knex, QUEUE_JOBS_TABLE);
  }
}
