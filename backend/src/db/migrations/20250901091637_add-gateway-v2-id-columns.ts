import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.DynamicSecret, "connectorId"))) {
    await knex.schema.alterTable(TableName.DynamicSecret, (table) => {
      table.uuid("connectorId");
      table.foreign("connectorId").references("id").inTable(TableName.Connector).onDelete("SET NULL");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "connectorId"))) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (table) => {
      table.uuid("connectorId");
      table.foreign("connectorId").references("id").inTable(TableName.Connector).onDelete("SET NULL");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.AppConnection, "connectorId"))) {
    await knex.schema.alterTable(TableName.AppConnection, (table) => {
      table.uuid("connectorId");
      table.foreign("connectorId").references("id").inTable(TableName.Connector).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.DynamicSecret, "connectorId")) {
    await knex.schema.alterTable(TableName.DynamicSecret, (table) => {
      table.dropColumn("connectorId");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "connectorId")) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (table) => {
      table.dropColumn("connectorId");
    });
  }

  if (await knex.schema.hasColumn(TableName.AppConnection, "connectorId")) {
    await knex.schema.alterTable(TableName.AppConnection, (table) => {
      table.dropColumn("connectorId");
    });
  }
}
