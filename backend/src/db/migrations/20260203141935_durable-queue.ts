/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import { Knex } from "knex";
import pg from "pg";

import { QueueJobs, QueueName } from "@app/queue";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const BATCH_SIZE = 1000;

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

const migratePgBossJobsToQueueJobs = async <TData>(
  knex: Knex,
  db: pg.Client,
  config: MigrationConfig<TData>
): Promise<void> => {
  let offset = 0;
  let totalMigrated = 0;
  let jobCount = 0;

  do {
    const jobs = await db.query<{ id: string; name: string; data: TData; start_after: Date }>(
      `
        SELECT id, name, data, start_after
        FROM pgboss.job
        WHERE state = 'created'
          AND name = $1
        ORDER BY createdon ASC
        LIMIT $2 OFFSET $3
      `,
      [config.pgBossQueueName, BATCH_SIZE, offset]
    );

    jobCount = jobs.rows.length;

    if (jobCount > 0) {
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

      totalMigrated += jobCount;
      offset += BATCH_SIZE;

      console.log(`Migrated ${config.logLabel} ${totalMigrated} jobs...`);
    }
  } while (jobCount > 0);
};

const migratePamSessionExpirationToQueueJobs = async (knex: Knex, db: pg.Client) => {
  await migratePgBossJobsToQueueJobs<{ sessionId: string }>(knex, db, {
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

const migrateDynamicSecretRevocationToQueueJobs = async (knex: Knex, db: pg.Client) => {
  await migratePgBossJobsToQueueJobs<{ leaseId: string; dynamicSecretId: string }>(knex, db, {
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
    });

    await createOnUpdateTrigger(knex, TableName.QueueJobs);
    const db = new pg.Client({
      application_name: "pgboss",
      connectionString: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_ROOT_CERT
        ? {
            rejectUnauthorized: true,
            ca: Buffer.from(process.env.DB_ROOT_CERT, "base64").toString("ascii")
          }
        : false
    });
    await migratePamSessionExpirationToQueueJobs(knex, db);
    await migrateDynamicSecretRevocationToQueueJobs(knex, db);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.QueueJobs);
  if (hasTable) await knex.schema.dropTable(TableName.QueueJobs);
  await dropOnUpdateTrigger(knex, TableName.QueueJobs);
}
