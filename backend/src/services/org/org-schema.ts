import { z } from "zod";

import { OrganizationsSchema } from "@app/db/schemas";

/** Zod schema for API response: org with sub-orgs */
export const OrgWithSubOrgsSchema = OrganizationsSchema.pick({
  id: true,
  name: true,
  slug: true,
  createdAt: true
}).extend({
  userJoinedAt: z.date().optional().nullable(),
  subOrganizations: OrganizationsSchema.pick({
    id: true,
    name: true,
    slug: true
  })
    .extend({ userJoinedAt: z.date().optional().nullable() })
    .array()
});

export const sanitizedOrganizationSchema = OrganizationsSchema.pick({
  id: true,
  name: true,
  customerId: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  authEnforced: true,
  googleSsoAuthEnforced: true,
  scimEnabled: true,
  kmsDefaultKeyId: true,
  defaultMembershipRole: true,
  enforceMfa: true,
  selectedMfaMethod: true,
  allowSecretSharingOutsideOrganization: true,
  shouldUseNewPrivilegeSystem: true,
  privilegeUpgradeInitiatedByUsername: true,
  privilegeUpgradeInitiatedAt: true,
  bypassOrgAuthEnabled: true,
  userTokenExpiration: true,
  secretsProductEnabled: true,
  pkiProductEnabled: true,
  kmsProductEnabled: true,
  sshProductEnabled: true,
  scannerProductEnabled: true,
  shareSecretsProductEnabled: true,
  maxSharedSecretLifetime: true,
  maxSharedSecretViewLimit: true,
  blockDuplicateSecretSyncDestinations: true,
  rootOrgId: true,
  parentOrgId: true,
  secretShareBrandConfig: true
});
