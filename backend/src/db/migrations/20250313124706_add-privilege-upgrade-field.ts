import { Knex } from "knex";
import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Organization, "shouldUseNewPrivilegeSystem"))) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.boolean("shouldUseNewPrivilegeSystem");
      t.string("privilegeUpgradeInitiatedByUsername");
      t.dateTime("privilegeUpgradeInitiatedAt");
    });

    await knex(TableName.Organization).update({
      shouldUseNewPrivilegeSystem: false
    });

    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.boolean("shouldUseNewPrivilegeSystem").defaultTo(true).notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Organization, "shouldUseNewPrivilegeSystem")) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("shouldUseNewPrivilegeSystem");
      t.dropColumn("privilegeUpgradeInitiatedByUsername");
      t.dropColumn("privilegeUpgradeInitiatedAt");
    });
  }
}
