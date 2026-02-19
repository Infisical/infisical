import { z } from "zod";

import { OrganizationsSchema } from "@app/db/schemas";

/** Minimal org fields (id, name, slug) – e.g. for sub-org list items or summaries */
export const orgBasicSchema = OrganizationsSchema.pick({
  id: true,
  name: true,
  slug: true
});
export type TOrgBasic = z.infer<typeof orgBasicSchema>;

/** Root org with accessible sub-orgs (basic info only) */
export type TOrgWithSubOrgs = TOrgBasic & {
  createdAt: Date;
  subOrganizations: TOrgBasic[];
};

/** Zod schema for API response: org with sub-orgs */
export const orgWithSubOrgsSchema = orgBasicSchema.extend({
  createdAt: z.date(),
  subOrganizations: z.array(orgBasicSchema)
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
