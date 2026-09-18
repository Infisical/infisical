import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateRequests)) {
    const hasPendingMessage = await knex.schema.hasColumn(TableName.CertificateRequests, "pendingMessage");
    if (!hasPendingMessage) {
      await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
        t.text("pendingMessage").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateRequests)) {
    const hasPendingMessage = await knex.schema.hasColumn(TableName.CertificateRequests, "pendingMessage");
    if (hasPendingMessage) {
      await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
        t.dropColumn("pendingMessage");
      });
    }
  }
}
