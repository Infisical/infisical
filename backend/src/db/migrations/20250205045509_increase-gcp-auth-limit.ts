import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hashtable = await knex.schema.hashtable(TableName.IdentityGcpAuth);
  const hasAllowedProjectsColumn = await knex.schema.hasColumn(TableName.IdentityGcpAuth, "allowedProjects");
  const hasAllowedServiceAccountsColumn = await knex.schema.hasColumn(
    TableName.IdentityGcpAuth,
    "allowedServiceAccounts"
  );
  const hasAllowedZones = await knex.schema.hasColumn(TableName.IdentityGcpAuth, "allowedZones");
  if (hashtable) {
    await knex.schema.alterTable(TableName.IdentityGcpAuth, (t) => {
      if (hasAllowedProjectsColumn) t.string("allowedProjects", 2500).alter();
      if (hasAllowedServiceAccountsColumn) t.string("allowedServiceAccounts", 5000).alter();
      if (hasAllowedZones) t.string("allowedZones", 2500).alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hashtable = await knex.schema.hashtable(TableName.IdentityGcpAuth);
  const hasAllowedProjectsColumn = await knex.schema.hasColumn(TableName.IdentityGcpAuth, "allowedProjects");
  const hasAllowedServiceAccountsColumn = await knex.schema.hasColumn(
    TableName.IdentityGcpAuth,
    "allowedServiceAccounts"
  );
  const hasAllowedZones = await knex.schema.hasColumn(TableName.IdentityGcpAuth, "allowedZones");
  if (hashtable) {
    await knex.schema.alterTable(TableName.IdentityGcpAuth, (t) => {
      if (hasAllowedProjectsColumn) t.string("allowedProjects").alter();
      if (hasAllowedServiceAccountsColumn) t.string("allowedServiceAccounts").alter();
      if (hasAllowedZones) t.string("allowedZones").alter();
    });
  }
}
