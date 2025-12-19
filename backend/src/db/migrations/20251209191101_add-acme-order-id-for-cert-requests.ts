import { Knex } from "knex";

import { TableName } from "../schemas";
import { dropConstraintIfExists } from "./utils/dropConstraintIfExists";

const FOREIGN_KEY_CONSTRAINT_NAME = "certificate_requests_acme_order_id_fkey";
const INDEX_NAME = "certificate_requests_acme_order_id_idx";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateRequests)) {
    const hasAcmeOrderId = await knex.schema.hasColumn(TableName.CertificateRequests, "acmeOrderId");

    if (!hasAcmeOrderId) {
      await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
        t.uuid("acmeOrderId").nullable();
        t.foreign("acmeOrderId", FOREIGN_KEY_CONSTRAINT_NAME)
          .references("id")
          .inTable(TableName.PkiAcmeOrder)
          .onDelete("SET NULL");
        t.index("acmeOrderId", INDEX_NAME);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateRequests)) {
    const hasAcmeOrderId = await knex.schema.hasColumn(TableName.CertificateRequests, "acmeOrderId");

    if (hasAcmeOrderId) {
      await dropConstraintIfExists(TableName.CertificateRequests, FOREIGN_KEY_CONSTRAINT_NAME, knex);
      await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
        t.dropIndex("acmeOrderId", INDEX_NAME);
        t.dropColumn("acmeOrderId");
      });
    }
  }
}
