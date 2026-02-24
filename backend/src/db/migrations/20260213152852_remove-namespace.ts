import { Knex } from "knex";

import { TableName } from "../schemas";
import { dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasNamespaceColumnInMembership = await knex.schema.hasColumn(TableName.Membership, "scopeNamespaceId");
  if (hasNamespaceColumnInMembership) {
    await knex.schema.alterTable(TableName.Membership, (t) => {
      t.dropChecks("scope_matches_id");
      t.dropColumn("scopeNamespaceId");
      t.check(
        `("scope" = 'project' AND "scopeProjectId" IS NOT NULL) OR ("scope" = 'organization')`,
        {},
        "scope_matches_id"
      );
    });
  }

  const hasNamespaceColumnInRole = await knex.schema.hasColumn(TableName.Role, "namespaceId");
  if (hasNamespaceColumnInRole) {
    await knex.schema.alterTable(TableName.Role, (t) => {
      t.dropColumn("namespaceId");
    });
  }

  const hasNamespaceColumnInAp = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "namespaceId");
  if (hasNamespaceColumnInAp) {
    await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
      t.dropColumn("namespaceId");
    });
  }

  await dropOnUpdateTrigger(knex, TableName.Namespace);
  await knex.schema.dropTableIfExists(TableName.Namespace);
}

export async function down(): Promise<void> {}
