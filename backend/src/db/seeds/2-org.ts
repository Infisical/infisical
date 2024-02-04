/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { Knex } from "knex";

import { OrgMembershipRole, OrgMembershipStatus, TableName } from "../schemas";
import { seedData1 } from "../seed-data";

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex(TableName.Organization).del();
  await knex(TableName.OrgMembership).del();

  const user = await knex(TableName.Users).where({ email: seedData1.email }).first();
  if (!user) throw new Error("User not found");
  // Inserts seed entries
  const [org] = await knex(TableName.Organization)
    .insert([
      {
        // @ts-expect-error exluded type id needs to be inserted here to keep it testable
        id: seedData1.organization.id,
        name: "infisical",
        slug: "infisical",
        customerId: null
      }
    ])
    .returning("*");

  await knex(TableName.OrgMembership).insert([
    {
      role: OrgMembershipRole.Admin,
      orgId: org.id,
      status: OrgMembershipStatus.Accepted,
      userId: user.id
    }
  ]);
}
