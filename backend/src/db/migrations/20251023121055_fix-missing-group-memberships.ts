import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasGroupsTable = await knex.schema.hasTable(TableName.Groups);
  const hasMembershipTable = await knex.schema.hasTable(TableName.Membership);
  const hasMembershipRoleTable = await knex.schema.hasTable(TableName.MembershipRole);

  if (!hasGroupsTable || !hasMembershipTable || !hasMembershipRoleTable) {
    return;
  }

  const groupsWithoutMembership = await knex
    .select(`${TableName.Groups}.id`, `${TableName.Groups}.orgId`)
    .from(TableName.Groups)
    .leftJoin(TableName.Membership, `${TableName.Groups}.id`, `${TableName.Membership}.actorGroupId`)
    .whereNull(`${TableName.Membership}.actorGroupId`);

  if (groupsWithoutMembership.length > 0) {
    const membershipInserts = groupsWithoutMembership.map((group) => ({
      actorGroupId: group.id,
      scope: AccessScope.Organization,
      scopeOrgId: group.orgId,
      isActive: true
    }));

    const insertedMemberships = await knex(TableName.Membership).insert(membershipInserts).returning("*");

    const membershipRoleInserts = insertedMemberships.map((membership) => ({
      membershipId: membership.id,
      role: OrgMembershipRole.NoAccess,
      customRoleId: null
    }));

    await knex(TableName.MembershipRole).insert(membershipRoleInserts);
  }

  await knex.schema.alterTable(TableName.Membership, (t) => {
    t.check(
      `("actorUserId" IS NOT NULL OR "actorIdentityId" IS NOT NULL OR "actorGroupId" IS NOT NULL)`,
      undefined,
      "at_least_one_actor"
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Membership, (t) => {
    t.dropChecks("at_least_one_actor");
  });
}
