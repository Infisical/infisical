import { OrderByDirection } from "@app/hooks/api/generic/types";
import { IdentityMembershipOrg } from "@app/hooks/api/identities/types";

import { MfaMethod } from "../auth/types";

export type TSecretShareBrandConfig = {
  primaryColor?: string;
  secondaryColor?: string;
} | null;

export type Organization = {
  id: string;
  name: string;
  createAt: string;
  updatedAt: string;
  authEnforced: boolean;
  googleSsoAuthEnforced: boolean;
  bypassOrgAuthEnabled: boolean;
  orgAuthMethod: string;
  scimEnabled: boolean;
  slug: string;
  defaultMembershipRole: string;
  enforceMfa: boolean;
  selectedMfaMethod?: MfaMethod;
  shouldUseNewPrivilegeSystem: boolean;
  allowSecretSharingOutsideOrganization?: boolean;
  userTokenExpiration?: string;
  userRole: string;
  userJoinedAt: string;
  // membership state, not an org column: only the membership-scoped list endpoints return it
  isActive?: boolean;
  secretsProductEnabled: boolean;
  pkiProductEnabled: boolean;
  kmsProductEnabled: boolean;
  scannerProductEnabled: boolean;
  shareSecretsProductEnabled: boolean;
  maxSharedSecretLifetime: number;
  maxSharedSecretViewLimit: number | null;
  blockDuplicateSecretSyncDestinations: boolean;
  allowCrossProjectSecretSharing: boolean;
  parentOrgId: string | null;
  rootOrgId: string | null;
  secretShareBrandConfig?: TSecretShareBrandConfig;
  pamProjectId: string | null;
};

export type UpdateOrgDTO = {
  orgId: string;
  name?: string;
  authEnforced?: boolean;
  googleSsoAuthEnforced?: boolean;
  scimEnabled?: boolean;
  slug?: string;
  defaultMembershipRoleSlug?: string;
  enforceMfa?: boolean;
  selectedMfaMethod?: MfaMethod;
  allowSecretSharingOutsideOrganization?: boolean;
  bypassOrgAuthEnabled?: boolean;
  userTokenExpiration?: string;
  secretsProductEnabled?: boolean;
  pkiProductEnabled?: boolean;
  kmsProductEnabled?: boolean;
  scannerProductEnabled?: boolean;
  shareSecretsProductEnabled?: boolean;
  maxSharedSecretViewLimit?: number | null;
  maxSharedSecretLifetime?: number;
  blockDuplicateSecretSyncDestinations?: boolean;
  allowCrossProjectSecretSharing?: boolean;
  secretShareBrandConfig?: TSecretShareBrandConfig;
};

export type TListOrgIdentitiesDTO = {
  organizationId: string;
  offset?: number;
  limit?: number;
  orderBy?: OrgIdentityOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TOrgIdentitiesList = {
  identityMemberships: IdentityMembershipOrg[];
  totalCount: number;
};

export enum OrgIdentityOrderBy {
  Name = "name",
  Role = "role",
  LastLogin = "lastLogin"
}

export enum OrgMembershipStatus {
  Invited = "invited",
  Accepted = "accepted"
}

export type TOrgProductStats = {
  secretManager: {
    secretsCount: number;
    environmentsCount: number;
    projectsCount: number;
  };
  certificateManager: {
    certificatesCount: number;
    certificateAuthoritiesCount: number;
    signersCount: number;
  };
  kms: {
    keysCount: number;
    clientsCount: number;
    projectsCount: number;
  };
  secretScanning: {
    dataSourcesCount: number;
    resourcesCount: number;
    projectsCount: number;
  };
  pam: {
    accountsCount: number;
    accountTemplatesCount: number;
    foldersCount: number;
  };
};
