import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasAllowedNamespaces = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "allowedNamespaces");
  const hasAllowedNames = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "allowedNames");
  const hasAllowedAudience = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "allowedAudience");

  if (hasAllowedNamespaces || hasAllowedNames || hasAllowedAudience) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      if (hasAllowedNames) t.string("allowedNames", 1000).notNullable().alter();
      if (hasAllowedNamespaces) t.string("allowedNamespaces", 1000).notNullable().alter();
      if (hasAllowedAudience) t.string("allowedAudience", 1000).notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAllowedNamespaces = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "allowedNamespaces");
  const hasAllowedNames = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "allowedNames");
  const hasAllowedAudience = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "allowedAudience");

  if (hasAllowedNamespaces || hasAllowedNames || hasAllowedAudience) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      if (hasAllowedNames) t.string("allowedNames", 255).notNullable().alter();
      if (hasAllowedNamespaces) t.string("allowedNamespaces", 255).notNullable().alter();
      if (hasAllowedAudience) t.string("allowedAudience", 255).notNullable().alter();
    });
  }
}
