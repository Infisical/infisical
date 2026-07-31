import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiScepEnrollmentConfig)) {
    const hasValidationConnectionId = await knex.schema.hasColumn(
      TableName.PkiScepEnrollmentConfig,
      "validationConnectionId"
    );
    const hasSignRaWithCa = await knex.schema.hasColumn(TableName.PkiScepEnrollmentConfig, "signRaWithCa");

    await knex.schema.alterTable(TableName.PkiScepEnrollmentConfig, (t) => {
      if (!hasValidationConnectionId) {
        t.uuid("validationConnectionId").nullable();
        t.foreign("validationConnectionId").references("id").inTable(TableName.AppConnection).onDelete("SET NULL");
        t.index("validationConnectionId");
      }
      if (!hasSignRaWithCa) {
        t.boolean("signRaWithCa").notNullable().defaultTo(false);
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiScepEnrollmentConfig)) {
    const hasValidationConnectionId = await knex.schema.hasColumn(
      TableName.PkiScepEnrollmentConfig,
      "validationConnectionId"
    );
    const hasSignRaWithCa = await knex.schema.hasColumn(TableName.PkiScepEnrollmentConfig, "signRaWithCa");

    await knex.schema.alterTable(TableName.PkiScepEnrollmentConfig, (t) => {
      if (hasValidationConnectionId) {
        t.dropForeign(["validationConnectionId"]);
        t.dropIndex("validationConnectionId");
        t.dropColumn("validationConnectionId");
      }
      if (hasSignRaWithCa) {
        t.dropColumn("signRaWithCa");
      }
    });
  }
}
