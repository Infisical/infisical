import { Knex } from "knex";

import { TableName } from "../schemas";

const CERTIFICATE_ID_INDEX = {
  name: "certificate_requests_certificate_id_created_at_idx",
  columns: ["certificateId", "createdAt"]
};

const PARTIAL_FK_INDEXES = [
  { table: TableName.CertificateRequests, column: "caId", name: "certificate_requests_caid_idx" },
  { table: TableName.CertificateRequests, column: "profileId", name: "certificate_requests_profileid_idx" },
  { table: TableName.CertificateRequests, column: "applicationId", name: "certificate_requests_applicationid_idx" },
  { table: TableName.Certificate, column: "caId", name: "certificates_caid_idx" }
];

const indexExists = async (knex: Knex, indexName: string): Promise<boolean> => {
  const result = await knex.raw(`SELECT 1 FROM pg_indexes WHERE indexname = ?`, [indexName]);
  return result.rows.length > 0;
};

export async function up(knex: Knex): Promise<void> {
  if (
    (await knex.schema.hasTable(TableName.CertificateRequests)) &&
    (await knex.schema.hasColumn(TableName.CertificateRequests, "certificateId")) &&
    (await knex.schema.hasColumn(TableName.CertificateRequests, "createdAt")) &&
    !(await indexExists(knex, CERTIFICATE_ID_INDEX.name))
  ) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.index(CERTIFICATE_ID_INDEX.columns, CERTIFICATE_ID_INDEX.name);
    });
  }

  for await (const idx of PARTIAL_FK_INDEXES) {
    if (
      (await knex.schema.hasTable(idx.table)) &&
      (await knex.schema.hasColumn(idx.table, idx.column)) &&
      !(await indexExists(knex, idx.name))
    ) {
      await knex.schema.alterTable(idx.table, (t) => {
        t.index([idx.column], idx.name, { predicate: knex.whereNotNull(idx.column) });
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  for await (const idx of PARTIAL_FK_INDEXES) {
    if ((await knex.schema.hasTable(idx.table)) && (await indexExists(knex, idx.name))) {
      await knex.schema.alterTable(idx.table, (t) => {
        t.dropIndex([idx.column], idx.name);
      });
    }
  }

  if (
    (await knex.schema.hasTable(TableName.CertificateRequests)) &&
    (await indexExists(knex, CERTIFICATE_ID_INDEX.name))
  ) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.dropIndex(CERTIFICATE_ID_INDEX.columns, CERTIFICATE_ID_INDEX.name);
    });
  }
}
