/* eslint-disable no-console */
import kx, { Knex } from "knex";

import { TableName } from "../schemas";

const INTERMEDIATE_AUDIT_LOG_TABLE = "intermediate_audit_logs";

const formatPartitionDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const createAuditLogPartition = async (knex: Knex, startDate: Date, endDate: Date) => {
  const startDateStr = formatPartitionDate(startDate);
  const endDateStr = formatPartitionDate(endDate);

  const partitionName = `${TableName.AuditLog}_${startDateStr.replaceAll("-", "")}_${endDateStr.replaceAll("-", "")}`;

  await knex.schema.raw(
    `CREATE TABLE ${partitionName} PARTITION OF ${TableName.AuditLog} FOR VALUES FROM ('${startDateStr}') TO ('${endDateStr}')`
  );
};

const up = async (knex: Knex): Promise<void> => {
  console.info("Dropping primary key of audit log table...");
  await knex.schema.alterTable(TableName.AuditLog, (t) => {
    // remove existing keys
    t.dropPrimary();
  });

  // Get all indices of the audit log table and drop them
  const indexNames: { rows: { indexname: string }[] } = await knex.raw(
    `
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = '${TableName.AuditLog}'
  `
  );

  console.log(
    "Deleting existing audit log indices:",
    indexNames.rows.map((e) => e.indexname)
  );

  for await (const row of indexNames.rows) {
    await knex.raw(`DROP INDEX IF EXISTS ${row.indexname}`);
  }

  // renaming audit log to intermediate table
  console.log("Renaming audit log table to the intermediate name");
  await knex.schema.renameTable(TableName.AuditLog, INTERMEDIATE_AUDIT_LOG_TABLE);

  if (!(await knex.schema.hasTable(TableName.AuditLog))) {
    const createTableSql = knex.schema
      .createTable(TableName.AuditLog, (t) => {
        t.uuid("id").defaultTo(knex.fn.uuid());
        t.string("actor").notNullable();
        t.jsonb("actorMetadata").notNullable();
        t.string("ipAddress");
        t.string("eventType").notNullable();
        t.jsonb("eventMetadata");
        t.string("userAgent");
        t.string("userAgentType");
        t.datetime("expiresAt");
        t.timestamps(true, true, true);
        t.uuid("orgId");
        t.string("projectId");
        t.string("projectName");
        t.primary(["id", "createdAt"]);
      })
      .toString();

    console.info("Creating partition table...");
    await knex.schema.raw(`
        ${createTableSql} PARTITION BY RANGE ("createdAt");
    `);

    console.log("Adding indices...");
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      t.index(["projectId", "createdAt"]);
      t.index(["orgId", "createdAt"]);
      t.index("expiresAt");
      t.index("orgId");
      t.index("projectId");
      t.index("eventType");
      t.index("userAgentType");
      t.index("actor");
    });

    console.log("Adding GIN indices...");

    await knex.raw(
      `CREATE INDEX IF NOT EXISTS "audit_logs_actorMetadata_idx" ON ${TableName.AuditLog} USING gin("actorMetadata" jsonb_path_ops)`
    );
    console.log("GIN index for actorMetadata done");

    await knex.raw(
      `CREATE INDEX IF NOT EXISTS "audit_logs_eventMetadata_idx" ON ${TableName.AuditLog} USING gin("eventMetadata" jsonb_path_ops)`
    );
    console.log("GIN index for eventMetadata done");

    // create default partition
    console.log("Creating default partition...");
    await knex.schema.raw(`CREATE TABLE ${TableName.AuditLog}_default PARTITION OF ${TableName.AuditLog} DEFAULT`);

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = formatPartitionDate(nextDate);

    console.log("Attaching existing audit log table as a partition...");
    await knex.schema.raw(`
    ALTER TABLE ${INTERMEDIATE_AUDIT_LOG_TABLE} ADD CONSTRAINT audit_log_old
    CHECK ( "createdAt" < DATE '${nextDateStr}' );

    ALTER TABLE ${TableName.AuditLog} ATTACH PARTITION ${INTERMEDIATE_AUDIT_LOG_TABLE}
    FOR VALUES FROM (MINVALUE) TO ('${nextDateStr}' );
    `);

    // create partition from now until end of month
    console.log("Creating audit log partitions ahead of time... next date:", nextDateStr);
    await createAuditLogPartition(knex, nextDate, new Date(nextDate.getFullYear(), nextDate.getMonth() + 1));

    // create partitions 20 years ahead
    const partitionMonths = 20 * 12;
    const partitionPromises: Promise<void>[] = [];
    for (let x = 1; x <= partitionMonths; x += 1) {
      partitionPromises.push(
        createAuditLogPartition(
          knex,
          new Date(nextDate.getFullYear(), nextDate.getMonth() + x, 1),
          new Date(nextDate.getFullYear(), nextDate.getMonth() + (x + 1), 1)
        )
      );
    }

    await Promise.all(partitionPromises);
    console.log("Partition migration complete");
  }
};

export const executeMigration = async (url: string) => {
  console.log("Executing migration...");
  const knex = kx({
    client: "pg",
    connection: url
  });

  await knex.transaction(async (tx) => {
    await up(tx);
  });
};

const dbUrl = process.env.AUDIT_LOGS_DB_CONNECTION_URI;
if (!dbUrl) {
  console.error("Please provide a DB connection URL to the AUDIT_LOGS_DB_CONNECTION_URI env");
  process.exit(1);
}

void executeMigration(dbUrl).then(() => {
  console.log("Migration: partition-audit-logs DONE");
  process.exit(0);
});
