/* eslint-disable no-console */
import { Knex } from "knex";

import { QueueJobs, QueueName } from "@app/queue";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

interface MigrationConfig<TData> {
  pgBossQueueName: string;
  queueName: string;
  queueJobName: string;
  logLabel: string;
  transformJob: (job: { id: string; data: TData; start_after: Date }) => {
    jobId: string;
    queueOptions: Record<string, unknown>;
  };
}

const migratePgBossJobsToQueueJobs = async <TData>(knex: Knex, config: MigrationConfig<TData>): Promise<void> => {
  const jobs = await knex.raw<{ rows: { id: string; name: string; data: TData; start_after: Date }[] }>(
    `
      SELECT id, name, data, start_after
      FROM pgboss.job
      WHERE state = 'created'
        AND name = ?
      ORDER BY created_on ASC
    `,
    [config.pgBossQueueName]
  );
  if (jobs.rows.length > 0) {
    await knex(TableName.QueueJobs).insert(
      jobs.rows.map((job) => {
        const { jobId, queueOptions } = config.transformJob(job);
        return {
          queueName: config.queueName,
          queueJobName: config.queueJobName,
          queueType: "bullmq",
          queueData: job.data,
          jobId,
          queueOptions
        };
      })
    );

    console.log(`Migrated ${config.logLabel} ${jobs.rows.length} jobs`);
  }
};

const migratePamSessionExpirationToQueueJobs = async (knex: Knex) => {
  await migratePgBossJobsToQueueJobs<{ sessionId: string }>(knex, {
    pgBossQueueName: QueueName.PamSessionExpiration,
    queueName: QueueName.PamSessionExpiration,
    queueJobName: QueueJobs.PamSessionExpiration,
    logLabel: "pam session expiration",
    transformJob: (job) => ({
      jobId: `pam-session-expiration-${job.data?.sessionId}`,
      queueOptions: {
        jobId: `pam-session-expiration-${job.data?.sessionId}`,
        delay: Math.max(0, new Date(job.start_after).getTime() - Date.now())
      }
    })
  });
};

const migrateDynamicSecretRevocationToQueueJobs = async (knex: Knex) => {
  await migratePgBossJobsToQueueJobs<{ leaseId: string; dynamicSecretId: string }>(knex, {
    pgBossQueueName: QueueName.DynamicSecretRevocation,
    queueName: QueueName.DynamicSecretRevocation,
    queueJobName: QueueJobs.DynamicSecretRevocation,
    logLabel: "dynamic secret revocation",
    transformJob: (job) => ({
      jobId: job.data.leaseId,
      queueOptions: {
        jobId: job.data.leaseId,
        delay: Math.max(0, new Date(job.start_after).getTime() - Date.now()),
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000 * 60 // 1 minute
        }
      }
    })
  });
};

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

      // Indexes for query optimization
      t.index(["queueName", "status", "createdAt"]);
      t.index(["jobId", "queueName"]);
      t.index(["status"]);
    });

    await createOnUpdateTrigger(knex, TableName.QueueJobs);
    const schemaCheck = await knex.raw(
      `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgboss') AS exists`
    );

    if (schemaCheck?.rows[0]?.exists) {
      await migratePamSessionExpirationToQueueJobs(knex);
      await migrateDynamicSecretRevocationToQueueJobs(knex);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.QueueJobs);
  if (hasTable) await knex.schema.dropTable(TableName.QueueJobs);
  await dropOnUpdateTrigger(knex, TableName.QueueJobs);
}
