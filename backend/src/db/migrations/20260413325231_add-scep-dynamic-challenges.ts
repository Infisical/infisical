import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiScepDynamicChallenge))) {
    await knex.schema.createTable(TableName.PkiScepDynamicChallenge, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("scepConfigId").notNullable();
      t.foreign("scepConfigId").references("id").inTable(TableName.PkiScepEnrollmentConfig).onDelete("CASCADE");
      t.index("scepConfigId");

      t.string("hashedChallenge", 64).notNullable();
      t.index("hashedChallenge");

      t.timestamp("expiresAt").notNullable();
      t.index("expiresAt");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiScepDynamicChallenge);
  }

  if (!(await knex.schema.hasColumn(TableName.PkiScepEnrollmentConfig, "challengeType"))) {
    await knex.schema.alterTable(TableName.PkiScepEnrollmentConfig, (t) => {
      t.string("challengeType", 32).notNullable().defaultTo("static");
      t.integer("dynamicChallengeExpiryMinutes").nullable();
      t.integer("dynamicChallengeMaxPending").nullable();
    });
  }

  if (await knex.schema.hasColumn(TableName.PkiScepEnrollmentConfig, "hashedChallengePassword")) {
    await knex.schema.alterTable(TableName.PkiScepEnrollmentConfig, (t) => {
      t.text("hashedChallengePassword").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiScepDynamicChallenge)) {
    await dropOnUpdateTrigger(knex, TableName.PkiScepDynamicChallenge);
    await knex.schema.dropTable(TableName.PkiScepDynamicChallenge);
  }

  if (await knex.schema.hasColumn(TableName.PkiScepEnrollmentConfig, "challengeType")) {
    await knex.schema.alterTable(TableName.PkiScepEnrollmentConfig, (t) => {
      t.dropColumn("challengeType");
      t.dropColumn("dynamicChallengeExpiryMinutes");
      t.dropColumn("dynamicChallengeMaxPending");
    });
  }

  if (await knex.schema.hasColumn(TableName.PkiScepEnrollmentConfig, "hashedChallengePassword")) {
    await knex(TableName.PkiScepEnrollmentConfig).whereNull("hashedChallengePassword").delete();

    await knex.schema.alterTable(TableName.PkiScepEnrollmentConfig, (t) => {
      t.text("hashedChallengePassword").notNullable().alter();
    });
  }
}
