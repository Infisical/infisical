import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTemplateBasicConstraintsColumn = await knex.schema.hasColumn(
    TableName.PkiCertificatePolicy,
    "basicConstraints"
  );
  if (!hasTemplateBasicConstraintsColumn) {
    await knex.schema.alterTable(TableName.PkiCertificatePolicy, (t) => {
      t.jsonb("basicConstraints");
    });
  }

  const hasRequestBasicConstraintsColumn = await knex.schema.hasColumn(
    TableName.CertificateRequests,
    "basicConstraints"
  );
  if (!hasRequestBasicConstraintsColumn) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.jsonb("basicConstraints");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTemplateBasicConstraintsColumn = await knex.schema.hasColumn(
    TableName.PkiCertificatePolicy,
    "basicConstraints"
  );
  if (hasTemplateBasicConstraintsColumn) {
    await knex.schema.alterTable(TableName.PkiCertificatePolicy, (t) => {
      t.dropColumn("basicConstraints");
    });
  }

  const hasRequestBasicConstraintsColumn = await knex.schema.hasColumn(
    TableName.CertificateRequests,
    "basicConstraints"
  );
  if (hasRequestBasicConstraintsColumn) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.dropColumn("basicConstraints");
    });
  }
}
