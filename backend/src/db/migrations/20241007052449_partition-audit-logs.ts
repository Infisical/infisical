import { Knex } from "knex";

import { TableName } from "../schemas";

const formatPartitionDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const createAuditLogPartition = async (knex: Knex, startDate: Date, endDate: Date) => {
  const startDateStr = formatPartitionDate(startDate);
  const endDateStr = formatPartitionDate(endDate);

  const partitionName = `${TableName.PartitionedAuditLog}_${startDateStr.replace(/-/g, "")}_${endDateStr.replace(
    /-/g,
    ""
  )}`;

  await knex.schema.raw(
    `CREATE TABLE ${partitionName} PARTITION OF ${TableName.PartitionedAuditLog} FOR VALUES FROM ('${startDateStr}') TO ('${endDateStr}')`
  );
};

const isUsingDedicatedAuditLogDb = Boolean(process.env.AUDIT_LOGS_DB_CONNECTION_URI);

export async function up(knex: Knex): Promise<void> {
  if (!isUsingDedicatedAuditLogDb && (await knex.schema.hasTable(TableName.AuditLog))) {
    console.info("Dropping primary key of Audit Log table...");
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      // remove existing keys
      t.dropPrimary();
    });
  }

  // create a new partitioned table for audit logs
  if (!(await knex.schema.hasTable(TableName.PartitionedAuditLog))) {
    const createTableSql = knex.schema
      .createTable(TableName.PartitionedAuditLog, (t) => {
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
    await knex.schema.alterTable(TableName.PartitionedAuditLog, (t) => {
      t.index(["projectId", "createdAt"]);
      t.index(["orgId", "createdAt"]);
      t.index("expiresAt");
      t.index("orgId");
      t.index("projectId");
    });

    console.log("Adding GIN indices...");

    await knex.raw(
      `CREATE INDEX IF NOT EXISTS "audit_logs_actorMetadata_idx" ON ${TableName.PartitionedAuditLog} USING gin("actorMetadata" jsonb_path_ops)`
    );
    console.log("GIN index for actorMetadata done");

    await knex.raw(
      `CREATE INDEX IF NOT EXISTS "audit_logs_eventMetadata_idx" ON ${TableName.PartitionedAuditLog} USING gin("eventMetadata" jsonb_path_ops)`
    );
    console.log("GIN index for eventMetadata done");

    // create default partition
    console.log("Creating default partition...");
    await knex.schema.raw(
      `CREATE TABLE ${TableName.PartitionedAuditLog}_default PARTITION OF ${TableName.PartitionedAuditLog} DEFAULT`
    );

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = formatPartitionDate(nextDate);

    // attach existing audit log table as a partition ONLY if using the same DB
    if (!isUsingDedicatedAuditLogDb) {
      console.log("Attaching existing audit log table as a partition...");
      await knex.schema.raw(`
      ALTER TABLE ${TableName.AuditLog} ADD CONSTRAINT audit_log_old
      CHECK ( "createdAt" < DATE '${nextDateStr}' );
  
      ALTER TABLE ${TableName.PartitionedAuditLog} ATTACH PARTITION ${TableName.AuditLog}
      FOR VALUES FROM (MINVALUE) TO ('${nextDateStr}' );
      `);
    }

    // create partition from now until end of month
    console.log("Creating audit log partitions ahead of time... next date:", nextDateStr);
    await createAuditLogPartition(knex, nextDate, new Date(nextDate.getFullYear(), nextDate.getMonth() + 1));

    // create partitions 4 years ahead
    const partitionMonths = 4 * 12;
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
}

export async function down(knex: Knex): Promise<void> {
  const partitionSearchResult = await knex.raw(`
      SELECT inhrelid::regclass::text
      FROM pg_inherits
      WHERE inhparent::regclass::text = '${TableName.PartitionedAuditLog}'
      AND inhrelid::regclass::text = '${TableName.AuditLog}'
  `);

  const isAuditLogAPartition = partitionSearchResult.rows.length > 0;
  if (isAuditLogAPartition) {
    // detach audit log from partition
    console.log("Detaching original audit log table from new partition table...");
    await knex.schema.raw(`
    ALTER TABLE ${TableName.PartitionedAuditLog} DETACH PARTITION ${TableName.AuditLog};

    ALTER TABLE ${TableName.AuditLog} DROP CONSTRAINT audit_log_old;
  `);

    // revert audit log modifications
    console.log("Reverting changes made to the audit log table...");
    if (await knex.schema.hasTable(TableName.AuditLog)) {
      await knex.schema.alterTable(TableName.AuditLog, (t) => {
        // we drop this first because adding to the partition results in a new primary key
        t.dropPrimary();

        // add back the original keys of the audit logs table
        t.primary(["id"], {
          constraintName: "audit_logs_pkey"
        });
      });
    }
  }

  await knex.schema.dropTableIfExists(TableName.PartitionedAuditLog);
  console.log("Partition rollback complete");
}
