import { Knex } from "knex";

import { chunkArray } from "@app/lib/fn";

import { AccessScope, TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (tx) => {
    const hasIdentityOrgCol = await tx.schema.hasColumn(TableName.Identity, "orgId");
    if (hasIdentityOrgCol) {
      const identityMemberships = await tx(TableName.Membership)
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
          const identities = await tx(TableName.Identity).whereIn("id", identityIds).select("*");
          await tx(TableName.Identity)
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

      await tx(TableName.Identity).whereNull("orgId").delete();
      await tx.schema.alterTable(TableName.Identity, (t) => {
        t.uuid("orgId").notNullable().alter();
      });
    }
  });
}

export async function down(): Promise<void> {}

const config = { transaction: false };
export { config };
