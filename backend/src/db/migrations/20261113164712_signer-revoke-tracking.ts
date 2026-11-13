import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCancelledByRevoke = await knex.schema.hasColumn(
    TableName.PkiSignerCertificateIssuanceJobs,
    "isCancelledByRevoke"
  );
  const hasAutoRenewal = await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "isAutoRenewal");
  if (!hasCancelledByRevoke || !hasAutoRenewal) {
    await knex.schema.alterTable(TableName.PkiSignerCertificateIssuanceJobs, (t) => {
      if (!hasCancelledByRevoke) t.boolean("isCancelledByRevoke").notNullable().defaultTo(false);
      if (!hasAutoRenewal) t.boolean("isAutoRenewal").notNullable().defaultTo(false);
    });
  }

  if (!(await knex.schema.hasColumn(TableName.PkiSigners, "pendingRevocation"))) {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      t.jsonb("pendingRevocation").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PkiSigners, "pendingRevocation")) {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      t.dropColumn("pendingRevocation");
    });
  }

  const hasCancelledByRevoke = await knex.schema.hasColumn(
    TableName.PkiSignerCertificateIssuanceJobs,
    "isCancelledByRevoke"
  );
  const hasAutoRenewal = await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "isAutoRenewal");
  if (hasCancelledByRevoke || hasAutoRenewal) {
    await knex.schema.alterTable(TableName.PkiSignerCertificateIssuanceJobs, (t) => {
      if (hasCancelledByRevoke) t.dropColumn("isCancelledByRevoke");
      if (hasAutoRenewal) t.dropColumn("isAutoRenewal");
    });
  }
}
