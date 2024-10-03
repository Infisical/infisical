import { Knex } from "knex";

import { TableName } from "../schemas";

const formatDateToYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // getMonth() returns 0-based month, so add 1
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const createAuditLogPartition = async (knex: Knex, startDate: Date, endDate: Date) => {
  const startDateStr = formatDateToYYYYMMDD(startDate);
  const endDateStr = formatDateToYYYYMMDD(endDate);

  const partitionName = `${TableName.PartitionedAuditLog}_${startDateStr.replace(/-/g, "")}_${endDateStr.replace(
    /-/g,
    ""
  )}`;

  await knex.schema.raw(
    `CREATE TABLE ${partitionName} PARTITION OF ${TableName.PartitionedAuditLog} FOR VALUES FROM ('${startDateStr}') TO ('${endDateStr}')`
  );
};

export async function up(knex: Knex): Promise<void> {
  // prepare the existing audit log table for it to become a partition
  if (await knex.schema.hasTable(TableName.AuditLog)) {
    const doesProjectIdExist = await knex.schema.hasColumn(TableName.AuditLog, "projectId");
    const doesOrgIdExist = await knex.schema.hasColumn(TableName.AuditLog, "orgId");
    const doesProjectNameExist = await knex.schema.hasColumn(TableName.AuditLog, "projectName");

    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      // remove existing keys
      t.dropPrimary();

      if (doesOrgIdExist) {
        t.dropForeign("orgId");
      }

      if (doesProjectIdExist) {
        t.dropForeign("projectId");
      }

      // add normalized fields present in the partition table
      if (!doesProjectNameExist) {
        t.string("projectName");
      }
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

    await knex.schema.raw(`
        ${createTableSql} PARTITION BY RANGE ("createdAt");
    `);

    // add indices
    await knex.raw(
      `CREATE INDEX "audit_logs_actorMetadata_idx" ON ${TableName.PartitionedAuditLog} USING gin("actorMetadata" jsonb_path_ops)`
    );

    await knex.raw(
      `CREATE INDEX "audit_logs_eventMetadata_idx" ON ${TableName.PartitionedAuditLog} USING gin("eventMetadata" jsonb_path_ops)`
    );

    // create default partition
    await knex.schema.raw(
      `CREATE TABLE ${TableName.PartitionedAuditLog}_default PARTITION OF ${TableName.PartitionedAuditLog} DEFAULT`
    );

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = formatDateToYYYYMMDD(nextDate);

    // attach existing audit log table as a partition
    await knex.schema.raw(`
    ALTER TABLE ${TableName.AuditLog} ADD CONSTRAINT audit_log_old
    CHECK ( "createdAt" < DATE '${nextDateStr}' );

    ALTER TABLE ${TableName.PartitionedAuditLog} ATTACH PARTITION ${TableName.AuditLog}
    FOR VALUES FROM (MINVALUE) TO ('${nextDateStr}' );
    `);

    // create partitions 3 months ahead
    await createAuditLogPartition(knex, nextDate, new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 1));

    await createAuditLogPartition(
      knex,
      new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 1),
      new Date(nextDate.getFullYear(), nextDate.getMonth() + 2, 1)
    );

    await createAuditLogPartition(
      knex,
      new Date(nextDate.getFullYear(), nextDate.getMonth() + 2, 1),
      new Date(nextDate.getFullYear(), nextDate.getMonth() + 3, 1)
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  // detach audit log from partition
  await knex.schema.raw(`
    ALTER TABLE ${TableName.PartitionedAuditLog} DETACH PARTITION ${TableName.AuditLog};

    ALTER TABLE ${TableName.AuditLog} DROP CONSTRAINT audit_log_old;
  `);

  // revert audit log modifications
  const doesProjectIdExist = await knex.schema.hasColumn(TableName.AuditLog, "projectId");
  const doesOrgIdExist = await knex.schema.hasColumn(TableName.AuditLog, "orgId");
  const doesTableExist = await knex.schema.hasTable(TableName.AuditLog);
  const doesProjectNameExist = await knex.schema.hasColumn(TableName.AuditLog, "projectName");

  if (doesTableExist) {
    await knex.schema.alterTable(TableName.AuditLog, (t) => {
      // we drop this first because adding to the partition results in a new primary key
      t.dropPrimary();

      // add back the original keys of the audit logs table
      t.primary(["id"], {
        constraintName: "audit_logs_pkey"
      });

      if (doesOrgIdExist) {
        t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      }
      if (doesProjectIdExist) {
        t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      }

      // remove normalized fields
      if (doesProjectNameExist) {
        t.dropColumn("projectName");
      }
    });
  }

  await knex.schema.dropTableIfExists(TableName.PartitionedAuditLog);
}
