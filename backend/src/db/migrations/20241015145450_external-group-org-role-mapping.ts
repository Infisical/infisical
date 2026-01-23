import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  // add external group to org role mapping table
  if (!(await knex.schema.hasTable(TableName.ExternalGroupOrgRoleMapping))) {
    await knex.schema.createTable(TableName.ExternalGroupOrgRoleMapping, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("groupName").notNullable();
      t.index("groupName");
      t.string("role").notNullable();
      t.uuid("roleId");
      t.foreign("roleId").references("id").inTable(TableName.OrgRoles);
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.unique(["orgId", "groupName"]);
    });

    await createOnUpdateTrigger(knex, TableName.ExternalGroupOrgRoleMapping);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.ExternalGroupOrgRoleMapping)) {
    await dropOnUpdateTrigger(knex, TableName.ExternalGroupOrgRoleMapping);

    await knex.schema.dropTable(TableName.ExternalGroupOrgRoleMapping);
  }
}
