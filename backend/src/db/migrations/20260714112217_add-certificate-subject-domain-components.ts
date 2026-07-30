import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // Domain components (DC) are multi-valued and ordered, stored comma-joined (DC labels contain no commas).
  const hasCertColumn = await knex.schema.hasColumn(TableName.Certificate, "subjectDomainComponents");
  if (!hasCertColumn) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.string("subjectDomainComponents").nullable();
    });
  }

  const hasRequestColumn = await knex.schema.hasColumn(TableName.CertificateRequests, "domainComponents");
  if (!hasRequestColumn) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.string("domainComponents").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCertColumn = await knex.schema.hasColumn(TableName.Certificate, "subjectDomainComponents");
  if (hasCertColumn) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.dropColumn("subjectDomainComponents");
    });
  }

  const hasRequestColumn = await knex.schema.hasColumn(TableName.CertificateRequests, "domainComponents");
  if (hasRequestColumn) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.dropColumn("domainComponents");
    });
  }
}
