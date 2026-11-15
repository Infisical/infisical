import { Knex } from "knex";

import { AccessScope, TableName } from "../schemas";

// Removing an identity from an org used to leave its rows in that org's groups, and group membership
// counts as org membership, so those identities kept the group's access to the org.
export async function up(knex: Knex): Promise<void> {
  await knex(TableName.IdentityGroupMembership)
    .whereNotExists(
      knex(TableName.Groups)
        .join(TableName.Membership, (qb) => {
          qb.on(`${TableName.Membership}.scopeOrgId`, `${TableName.Groups}.orgId`).andOn(
            `${TableName.Membership}.actorIdentityId`,
            `${TableName.IdentityGroupMembership}.identityId`
          );
        })
        .whereRaw("?? = ??", [`${TableName.Groups}.id`, `${TableName.IdentityGroupMembership}.groupId`])
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .select(knex.raw("1"))
    )
    .delete();
}

export async function down(): Promise<void> {}
