import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PkiApiEnrollmentConfig, "autoRenewDays")) {
    await knex.schema.alterTable(TableName.PkiApiEnrollmentConfig, (t) => {
      t.dropColumn("autoRenewDays");
      t.integer("renewBeforeDays");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.Certificate, "renewBeforeDays"))) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.integer("renewBeforeDays").nullable();
      t.uuid("renewedFromId").nullable();
      t.uuid("renewedById").nullable();
      t.text("renewalError").nullable();
      t.string("keyAlgorithm").nullable();
      t.string("signatureAlgorithm").nullable();
      t.foreign("renewedFromId").references("id").inTable(TableName.Certificate).onDelete("SET NULL");
      t.foreign("renewedById").references("id").inTable(TableName.Certificate).onDelete("SET NULL");
      t.index("renewedFromId");
      t.index("renewedById");
      t.index("renewBeforeDays");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Certificate, "renewBeforeDays")) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.dropForeign(["renewedFromId"]);
      t.dropForeign(["renewedById"]);
      t.dropIndex("renewedFromId");
      t.dropIndex("renewedById");
      t.dropIndex("renewBeforeDays");
      t.dropColumn("renewBeforeDays");
      t.dropColumn("renewedFromId");
      t.dropColumn("renewedById");
      t.dropColumn("renewalError");
      t.dropColumn("keyAlgorithm");
      t.dropColumn("signatureAlgorithm");
    });
  }

  if (await knex.schema.hasColumn(TableName.PkiApiEnrollmentConfig, "renewBeforeDays")) {
    await knex.schema.alterTable(TableName.PkiApiEnrollmentConfig, (t) => {
      t.dropColumn("renewBeforeDays");
      t.integer("autoRenewDays");
    });
  }
}
