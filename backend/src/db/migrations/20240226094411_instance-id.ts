import { Knex } from "knex";

import { TableName } from "../schemas";

const ADMIN_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
    t.uuid("instanceId").notNullable().defaultTo(knex.fn.uuid());
  });
  // this is updated to avoid race condition on replication
  // eslint-disable-next-line
  // @ts-ignore
  await knex(TableName.SuperAdmin).update({ id: ADMIN_CONFIG_UUID }).whereNotNull("id").limit(1);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
    t.dropColumn("instanceId");
  });
}
