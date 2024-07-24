import bcrypt from "bcrypt";
import { Knex } from "knex";

import { IdentityAuthMethod, OrgMembershipRole, ProjectMembershipRole, TableName } from "../schemas";
import { seedData1 } from "../seed-data";

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex(TableName.Identity).del();
  await knex(TableName.IdentityOrgMembership).del();

  // Inserts seed entries
  await knex(TableName.Identity).insert([
    {
      // eslint-disable-next-line
      // @ts-ignore
      id: seedData1.machineIdentity.id,
      name: seedData1.machineIdentity.name,
      authMethod: IdentityAuthMethod.Univeral
    }
  ]);
  const identityUa = await knex(TableName.IdentityUniversalAuth)
    .insert([
      {
        identityId: seedData1.machineIdentity.id,
        clientId: seedData1.machineIdentity.clientCredentials.id,
        clientSecretTrustedIps: JSON.stringify([
          {
            type: "ipv4",
            prefix: 0,
            ipAddress: "0.0.0.0"
          },
          {
            type: "ipv6",
            prefix: 0,
            ipAddress: "::"
          }
        ]),
        accessTokenTrustedIps: JSON.stringify([
          {
            type: "ipv4",
            prefix: 0,
            ipAddress: "0.0.0.0"
          },
          {
            type: "ipv6",
            prefix: 0,
            ipAddress: "::"
          }
        ]),
        accessTokenTTL: 2592000,
        accessTokenMaxTTL: 2592000,
        accessTokenNumUsesLimit: 0
      }
    ])
    .returning("*");
  const clientSecretHash = await bcrypt.hash(seedData1.machineIdentity.clientCredentials.secret, 10);
  await knex(TableName.IdentityUaClientSecret).insert([
    {
      identityUAId: identityUa[0].id,
      description: "",
      clientSecretTTL: 0,
      clientSecretNumUses: 0,
      clientSecretNumUsesLimit: 0,
      clientSecretPrefix: seedData1.machineIdentity.clientCredentials.secret.slice(0, 4),
      clientSecretHash,
      isClientSecretRevoked: false
    }
  ]);
  await knex(TableName.IdentityOrgMembership).insert([
    {
      identityId: seedData1.machineIdentity.id,
      orgId: seedData1.organization.id,
      role: OrgMembershipRole.Admin
    }
  ]);

  const identityProjectMembership = await knex(TableName.IdentityProjectMembership)
    .insert({
      identityId: seedData1.machineIdentity.id,
      projectId: seedData1.project.id
    })
    .returning("*");

  await knex(TableName.IdentityProjectMembershipRole).insert({
    role: ProjectMembershipRole.Admin,
    projectMembershipId: identityProjectMembership[0].id
  });
  const identityProjectMembershipV3 = await knex(TableName.IdentityProjectMembership)
    .insert({
      identityId: seedData1.machineIdentity.id,
      projectId: seedData1.projectV3.id
    })
    .returning("*");

  await knex(TableName.IdentityProjectMembershipRole).insert({
    role: ProjectMembershipRole.Admin,
    projectMembershipId: identityProjectMembershipV3[0].id
  });
}
