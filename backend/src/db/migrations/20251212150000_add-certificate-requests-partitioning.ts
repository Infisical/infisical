import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger } from "../utils";

const INTERMEDIATE_CERTIFICATE_REQUESTS_TABLE = "intermediate_certificate_requests";

const formatPartitionDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const createCertificateRequestPartition = async (knex: Knex, startDate: Date, endDate: Date) => {
  const startDateStr = formatPartitionDate(startDate);
  const endDateStr = formatPartitionDate(endDate);

  const partitionName = `${TableName.CertificateRequests}_${startDateStr.replace(/-/g, "")}_${endDateStr.replace(/-/g, "")}`;

  await knex.schema.raw(
    `CREATE TABLE ${partitionName} PARTITION OF ${TableName.CertificateRequests} FOR VALUES FROM ('${startDateStr}') TO ('${endDateStr}')`
  );
};

export async function up(knex: Knex): Promise<void> {
  // Check if table is already partitioned by looking for partition information
  const partitionInfo: { rows: { schemaname: string; tablename: string }[] } = await knex.raw(
    `
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE tablename LIKE '${TableName.CertificateRequests}_%'
    AND schemaname = 'public'
  `
  );

  if (partitionInfo.rows.length > 0) {
    console.info("Certificate requests table is already partitioned, skipping migration...");
    return;
  }

  if (await knex.schema.hasTable(TableName.CertificateRequests)) {
    console.info("Converting existing certificate_requests table to partitioned table...");

    // Drop primary key constraint
    console.info("Dropping primary key of certificate_requests table...");
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.dropPrimary();
    });

    // Get all indices of the certificate_requests table and drop them
    const indexNames: { rows: { indexname: string }[] } = await knex.raw(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = '${TableName.CertificateRequests}'
    `
    );

    console.log(
      "Deleting existing certificate_requests indices:",
      indexNames.rows.map((e) => e.indexname)
    );

    for await (const row of indexNames.rows) {
      await knex.raw(`DROP INDEX IF EXISTS ??`, [row.indexname]);
    }

    // Rename existing table to intermediate name
    console.log("Renaming certificate_requests table to intermediate name");
    await knex.schema.renameTable(TableName.CertificateRequests, INTERMEDIATE_CERTIFICATE_REQUESTS_TABLE);

    // Create new partitioned table with same schema - MUST MATCH EXACTLY the original table
    const createTableSql = knex.schema
      .createTable(TableName.CertificateRequests, (t) => {
        t.uuid("id").defaultTo(knex.fn.uuid());
        t.timestamps(true, true, true);
        t.string("status").notNullable();
        t.string("projectId").notNullable();
        t.uuid("profileId").nullable();
        t.uuid("caId").nullable();
        t.uuid("certificateId").nullable();
        t.text("csr").nullable();
        t.string("commonName").nullable();
        t.text("altNames").nullable();
        t.specificType("keyUsages", "text[]").nullable();
        t.specificType("extendedKeyUsages", "text[]").nullable();
        t.datetime("notBefore").nullable();
        t.datetime("notAfter").nullable();
        t.string("keyAlgorithm").nullable();
        t.string("signatureAlgorithm").nullable();
        t.text("errorMessage").nullable();
        t.text("metadata").nullable();

        t.primary(["id", "createdAt"]);
      })
      .toString();

    console.info("Creating partitioned certificate_requests table...");
    await knex.schema.raw(`${createTableSql} PARTITION BY RANGE ("createdAt")`);

    console.log("Adding indices...");
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.foreign("profileId").references("id").inTable(TableName.PkiCertificateProfile).onDelete("SET NULL");
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("SET NULL");
      t.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("SET NULL");

      t.index("status");
      t.index(["projectId", "status"]);
      t.index(["projectId", "createdAt"]);
    });

    // Create default partition
    console.log("Creating default partition...");
    await knex.schema.raw(
      `CREATE TABLE ${TableName.CertificateRequests}_default PARTITION OF ${TableName.CertificateRequests} DEFAULT`
    );

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = formatPartitionDate(nextDate);

    console.log("Attaching existing certificate_requests table as a partition...");
    await knex.schema.raw(
      `
      ALTER TABLE ${INTERMEDIATE_CERTIFICATE_REQUESTS_TABLE} ADD CONSTRAINT certificate_requests_old
      CHECK ( "createdAt" < DATE '${nextDateStr}' );

      ALTER TABLE ${TableName.CertificateRequests} ATTACH PARTITION ${INTERMEDIATE_CERTIFICATE_REQUESTS_TABLE}
      FOR VALUES FROM (MINVALUE) TO ('${nextDateStr}' );
    `
    );

    // Create partition from next day until end of month
    console.log("Creating certificate_requests partitions ahead of time... next date:", nextDateStr);
    await createCertificateRequestPartition(
      knex,
      nextDate,
      new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 1)
    );

    // Create partitions 20 years ahead for certificate requests
    const partitionMonths = 20 * 12;
    const partitionPromises: Promise<void>[] = [];
    for (let x = 1; x <= partitionMonths; x += 1) {
      partitionPromises.push(
        createCertificateRequestPartition(
          knex,
          new Date(nextDate.getFullYear(), nextDate.getMonth() + x, 1),
          new Date(nextDate.getFullYear(), nextDate.getMonth() + (x + 1), 1)
        )
      );
    }

    await Promise.all(partitionPromises);

    await createOnUpdateTrigger(knex, TableName.CertificateRequests);
    console.log("Certificate requests partition migration complete");
  } else {
    console.log("Certificate requests table does not exist, skipping partitioning migration");
  }
}

export async function down(): Promise<void> {
  // skip
}
