// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Knex } from "knex";

import { TableName } from "../schemas";

const ADMIN_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
    t.uuid("instanceId").notNullable().defaultTo(knex.fn.uuid());
  });

  const superUserConfigExists = await knex(TableName.SuperAdmin).where("id", ADMIN_CONFIG_UUID).first();
  if (!superUserConfigExists) {
    // eslint-disable-next-line
    await knex(TableName.SuperAdmin).update({ id: ADMIN_CONFIG_UUID }).whereNotNull("id").limit(1);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
    t.dropColumn("instanceId");
  });
}
