import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "../schemas";
import { seedData1 } from "../seed-data";

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex(TableName.Organization).del();
  await knex(TableName.Membership).del();
  await knex(TableName.MembershipRole).del();

  const user = await knex(TableName.Users).where({ email: seedData1.email }).first();
  if (!user) throw new Error("User not found");
  // Inserts seed entries
  const [org] = await knex(TableName.Organization)
    .insert([
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: seedData1.organization.id,
        name: "infisical",
        slug: "infisical",
        customerId: null
      }
    ])
    .returning("*");

  const [membership] = await knex(TableName.Membership)
    .insert([
      {
        scope: AccessScope.Organization,
        scopeOrgId: org.id,
        actorUserId: user.id,
        isActive: true,
        status: OrgMembershipStatus.Accepted
      }
    ])
    .returning("*");

  await knex(TableName.MembershipRole).insert([
    {
      membershipId: membership.id,
      role: OrgMembershipRole.Admin
    }
  ]);
}
