import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.TotpConfig))) {
    await knex.schema.createTable(TableName.TotpConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.boolean("isVerified").defaultTo(false).notNullable();
      t.binary("encryptedRecoveryCodes").notNullable();
      t.binary("encryptedSecret").notNullable();
      t.timestamps(true, true, true);
      t.unique("userId");
    });

    await createOnUpdateTrigger(knex, TableName.TotpConfig);
  }

  const doesOrgMfaMethodColExist = await knex.schema.hasColumn(TableName.Organization, "selectedMfaMethod");
  await knex.schema.alterTable(TableName.Organization, (t) => {
    if (!doesOrgMfaMethodColExist) {
      t.string("selectedMfaMethod");
    }
  });

  const doesUserSelectedMfaMethodColExist = await knex.schema.hasColumn(TableName.Users, "selectedMfaMethod");
  await knex.schema.alterTable(TableName.Users, (t) => {
    if (!doesUserSelectedMfaMethodColExist) {
      t.string("selectedMfaMethod");
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.TotpConfig);
  await knex.schema.dropTableIfExists(TableName.TotpConfig);

  const doesOrgMfaMethodColExist = await knex.schema.hasColumn(TableName.Organization, "selectedMfaMethod");
  await knex.schema.alterTable(TableName.Organization, (t) => {
    if (doesOrgMfaMethodColExist) {
      t.dropColumn("selectedMfaMethod");
    }
  });

  const doesUserSelectedMfaMethodColExist = await knex.schema.hasColumn(TableName.Users, "selectedMfaMethod");
  await knex.schema.alterTable(TableName.Users, (t) => {
    if (doesUserSelectedMfaMethodColExist) {
      t.dropColumn("selectedMfaMethod");
    }
  });
}
