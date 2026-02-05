import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // Add group mapping columns to saml_configs table
  const hasGroupMappingColumns = await knex.schema.hasColumn(TableName.SamlConfig, "manageGroupMemberships");
  if (!hasGroupMappingColumns) {
    await knex.schema.alterTable(TableName.SamlConfig, (table) => {
      table.boolean("manageGroupMemberships").defaultTo(false);
      table.string("groupAttributeName").defaultTo("groups");
      table.enu("groupMappingMode", ["groups", "roles", "both"]).defaultTo("groups");
      table.boolean("autoCreateGroups").defaultTo(false);
      table.enu("groupRolePrecedence", ["group", "role", "highest"]).defaultTo("highest");
    });
  }

  // Create saml_group_mappings table
  const hasSamlGroupMappingsTable = await knex.schema.hasTable(TableName.SamlGroupMapping);
  if (!hasSamlGroupMappingsTable) {
    await knex.schema.createTable(TableName.SamlGroupMapping, (table) => {
      table.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      table.uuid("samlConfigId").notNullable();
      table.string("samlGroupName").notNullable();
      table.uuid("groupId").nullable();
      table.timestamps(true, true, true);
      
      table.foreign("samlConfigId").references("id").inTable(TableName.SamlConfig).onDelete("CASCADE");
      table.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");
      
      table.unique(["samlConfigId", "samlGroupName"]);
      table.index(["samlConfigId", "samlGroupName"]);
      table.index("groupId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop saml_group_mappings table
  const hasSamlGroupMappingsTable = await knex.schema.hasTable(TableName.SamlGroupMapping);
  if (hasSamlGroupMappingsTable) {
    await knex.schema.dropTable(TableName.SamlGroupMapping);
  }

  // Remove group mapping columns from saml_configs table
  const hasGroupMappingColumns = await knex.schema.hasColumn(TableName.SamlConfig, "manageGroupMemberships");
  if (hasGroupMappingColumns) {
    await knex.schema.alterTable(TableName.SamlConfig, (table) => {
      table.dropColumn("manageGroupMemberships");
      table.dropColumn("groupAttributeName");
      table.dropColumn("groupMappingMode");
      table.dropColumn("autoCreateGroups");
      table.dropColumn("groupRolePrecedence");
    });
  }
}