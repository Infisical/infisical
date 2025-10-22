import { Knex } from "knex";

import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";
import { chunkArray } from "@app/lib/fn";

import { AccessScope, TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasParentOrgId = await knex.schema.hasColumn(TableName.Organization, "parentOrgId");
  if (!hasParentOrgId) {
    await knex.schema.alterTable(TableName.Organization, async (t) => {
      // the one just above the chain
      t.uuid("parentOrgId");
      t.foreign("parentOrgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      // this would root organization containing various informations like billing etc
      t.uuid("rootOrgId");
      t.foreign("rootOrgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      await dropConstraintIfExists(TableName.Organization, "organizations_slug_unique", knex);
      t.unique(["rootOrgId", "parentOrgId", "slug"]);
    });

    // had to switch to raw for null not distinct
  }

  const hasIdentityOrgCol = await knex.schema.hasColumn(TableName.Identity, "orgId");
  if (!hasIdentityOrgCol) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.uuid("orgId");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    });

    const identityMemberships = await knex(TableName.Membership)
      .where({
        scope: AccessScope.Organization
      })
      .whereNotNull("actorIdentityId")
      .select("actorIdentityId", "scopeOrgId");

    const identityToOrgMapping: Record<string, string> = {};
    identityMemberships.forEach((el) => {
      if (el.actorIdentityId) {
        identityToOrgMapping[el.actorIdentityId] = el.scopeOrgId;
      }
    });

    const batchMemberships = chunkArray(identityMemberships, 500);
    for await (const membership of batchMemberships) {
      const identityIds = membership.map((el) => el.actorIdentityId).filter(Boolean) as string[];
      if (identityIds.length) {
        const identities = await knex(TableName.Identity).whereIn("id", identityIds).select("*");
        await knex(TableName.Identity)
          .insert(
            identities.map((el) => ({
              ...el,
              orgId: identityToOrgMapping[el.id]
            }))
          )
          .onConflict("id")
          .merge();
      }
    }

    await knex(TableName.Identity).whereNull("orgId").delete();

    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.uuid("orgId").notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasParentOrgId = await knex.schema.hasColumn(TableName.Organization, "parentOrgId");
  const hasRootOrgId = await knex.schema.hasColumn(TableName.Organization, "rootOrgId");
  if (hasParentOrgId || hasRootOrgId) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      if (hasParentOrgId) t.dropColumn("parentOrgId");
      if (hasRootOrgId) t.dropColumn("rootOrgId");
    });
  }

  const hasIdentityOrgCol = await knex.schema.hasColumn(TableName.Identity, "orgId");
  if (hasIdentityOrgCol) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.dropColumn("orgId");
    });
  }
}
