import { Knex } from "knex";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { getHsmConfig, initEnvConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { initLogger, logger } from "@app/lib/logger";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { AccessScope, IdentityAuthMethod, OrgMembershipRole, ProjectMembershipRole, TableName } from "../schemas";
import { seedData1 } from "../seed-data";

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex(TableName.Identity).del();

  initLogger();

  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const hsmConfig = getHsmConfig(logger);

  const hsmModule = initializeHsmModule(hsmConfig);
  hsmModule.initialize();

  const hsmService = hsmServiceFactory({
    hsmModule: hsmModule.getModule(),
    envConfig: hsmConfig
  });

  await hsmService.startService();

  await initEnvConfig(hsmService, kmsRootConfigDAL, superAdminDAL, logger);

  // Inserts seed entries
  await knex(TableName.Identity).insert([
    {
      // eslint-disable-next-line
      // @ts-ignore
      id: seedData1.machineIdentity.id,
      name: seedData1.machineIdentity.name,
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      orgId: seedData1.organization.id
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

  const clientSecretHash = await crypto.hashing().createHash(seedData1.machineIdentity.clientCredentials.secret, 10);

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
  const [orgMembership] = await knex(TableName.Membership)
    .insert([
      {
        actorIdentityId: seedData1.machineIdentity.id,
        scopeOrgId: seedData1.organization.id,
        scope: AccessScope.Organization
      }
    ])
    .returning("*");
  await knex(TableName.MembershipRole).insert([
    {
      membershipId: orgMembership.id,
      role: OrgMembershipRole.Admin
    }
  ]);

  const identityProjectMembership = await knex(TableName.Membership)
    .insert({
      actorIdentityId: seedData1.machineIdentity.id,
      scopeOrgId: seedData1.organization.id,
      scope: AccessScope.Project,
      scopeProjectId: seedData1.project.id
    })
    .returning("*");

  await knex(TableName.MembershipRole).insert({
    role: ProjectMembershipRole.Admin,
    membershipId: identityProjectMembership[0].id
  });

  const identityProjectMembershipV3 = await knex(TableName.Membership)
    .insert({
      actorIdentityId: seedData1.machineIdentity.id,
      scopeOrgId: seedData1.organization.id,
      scope: AccessScope.Project,
      scopeProjectId: seedData1.projectV3.id
    })
    .returning("*");

  await knex(TableName.MembershipRole).insert({
    role: ProjectMembershipRole.Admin,
    membershipId: identityProjectMembershipV3[0].id
  });
}
