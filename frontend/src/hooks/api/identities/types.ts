import { TemporaryPermissionMode } from "@app/hooks/api/shared";

import { OrderByDirection } from "../generic/types";
import { OrgIdentityOrderBy } from "../organization/types";
import { Project } from "../projects/types";
import { TOrgRole } from "../roles/types";
import { IdentityAuthMethod, IdentityJwtConfigurationType } from "./enums";

export type IdentityTrustedIp = {
  id: string;
  ipAddress: string;
  type: "ipv4" | "ipv6";
  prefix?: number;
};

export type Identity = {
  id: string;
  name: string;
  hasDeleteProtection: boolean;
  authMethods: IdentityAuthMethod[];
  activeLockoutAuthMethods: IdentityAuthMethod[];
  createdAt: string;
  updatedAt: string;
  isInstanceAdmin?: boolean;
  orgId: string;
  projectId?: string | null;
  metadata?: { key: string; value: string; id: string }[];
};

export type IdentityAccessToken = {
  id: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUses: number;
  accessTokenNumUsesLimit: number;
  accessTokenLastUsedAt: string | null;
  accessTokenLastRenewedAt: string | null;
  isAccessTokenRevoked: boolean;
  identityUAClientSecretId: string | null;
  identityId: string;
  createdAt: string;
  updatedAt: string;
  name: string | null;
};

export type IdentityMembershipOrg = {
  id: string;
  identity: Identity;
  organization: string;
  lastLoginAuthMethod?: IdentityAuthMethod;
  lastLoginTime?: string;
  metadata: { key: string; value: string; id: string }[];
  role: "admin" | "member" | "viewer" | "no-access" | "custom";
  customRole?: TOrgRole;
  createdAt: string;
  updatedAt: string;
};

export type IdentityProjectMembershipV1 = {
  id: string;
  identity: Identity;
  project: Pick<Project, "id" | "name" | "type">;
  roles: Array<
    {
      id: string;
      role: "owner" | "admin" | "member" | "no-access" | "custom";
      customRoleId: string;
      customRoleName: string;
      customRoleSlug: string;
    } & (
      | {
          isTemporary: false;
          temporaryRange: null;
          temporaryMode: null;
          temporaryAccessEndTime: null;
          temporaryAccessStartTime: null;
        }
      | {
          isTemporary: true;
          temporaryRange: string;
          temporaryMode: TemporaryPermissionMode;
          temporaryAccessEndTime: string;
          temporaryAccessStartTime: string;
        }
    )
  >;
  createdAt: string;
  updatedAt: string;
  lastLoginTime?: string;
  lastLoginAuthMethod?: IdentityAuthMethod;
};

export type IdentityProjectMembershipV2 = {
  id: string;
  identity: Identity;
  roles: Array<
    {
      id: string;
      role: "owner" | "admin" | "member" | "no-access" | "custom";
      customRoleId: string;
      customRoleName: string;
      customRoleSlug: string;
    } & (
      | {
          isTemporary: false;
          temporaryRange: null;
          temporaryMode: null;
          temporaryAccessEndTime: null;
          temporaryAccessStartTime: null;
        }
      | {
          isTemporary: true;
          temporaryRange: string;
          temporaryMode: TemporaryPermissionMode;
          temporaryAccessEndTime: string;
          temporaryAccessStartTime: string;
        }
    )
  >;
  createdAt: string;
  updatedAt: string;
  lastLoginTime?: string;
  lastLoginAuthMethod?: IdentityAuthMethod;
};

export type CreateIdentityDTO = {
  name: string;
  organizationId: string;
  role?: string;
  hasDeleteProtection: boolean;
  metadata?: { key: string; value: string }[];
};

export type UpdateIdentityDTO = {
  identityId: string;
  name?: string;
  role?: string;
  hasDeleteProtection?: boolean;
  organizationId: string;
  metadata?: { key: string; value: string }[];
};

export type DeleteIdentityDTO = {
  identityId: string;
  organizationId: string;
};

export type IdentityUniversalAuth = {
  identityId: string;
  clientId: string;
  clientSecretTrustedIps: IdentityTrustedIp[];
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
  accessTokenPeriod: number;
  lockoutEnabled: boolean;
  lockoutThreshold: number;
  lockoutDurationSeconds: number;
  lockoutCounterResetSeconds: number;
};

export type AddIdentityUniversalAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  clientSecretTrustedIps: {
    ipAddress: string;
  }[];
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenPeriod: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
  lockoutEnabled: boolean;
  lockoutThreshold: number;
  lockoutDurationSeconds: number;
  lockoutCounterResetSeconds: number;
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityUniversalAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  clientSecretTrustedIps?: {
    ipAddress: string;
  }[];
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenPeriod?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
  lockoutEnabled?: boolean;
  lockoutThreshold?: number;
  lockoutDurationSeconds?: number;
  lockoutCounterResetSeconds?: number;
} & ({ organizationId: string } | { projectId: string });

export type DeleteIdentityUniversalAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export type IdentityGcpAuth = {
  identityId: string;
  type: "iam" | "gce";
  allowedServiceAccounts: string;
  allowedProjects: string;
  allowedZones: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityGcpAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  type: "iam" | "gce";
  allowedServiceAccounts: string;
  allowedProjects: string;
  allowedZones: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityGcpAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  type?: "iam" | "gce";
  allowedServiceAccounts?: string;
  allowedProjects?: string;
  allowedZones?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type DeleteIdentityGcpAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export type IdentityOidcAuth = {
  identityId: string;
  oidcDiscoveryUrl: string;
  caCert: string;
  boundIssuer: string;
  boundAudiences: string;
  boundClaims: Record<string, string>;
  claimMetadataMapping?: Record<string, string>;
  boundSubject: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityOidcAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  oidcDiscoveryUrl: string;
  caCert: string;
  boundIssuer: string;
  boundAudiences: string;
  boundClaims: Record<string, string>;
  claimMetadataMapping?: Record<string, string>;
  boundSubject: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityOidcAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  oidcDiscoveryUrl?: string;
  caCert?: string;
  boundIssuer?: string;
  boundAudiences?: string;
  boundClaims?: Record<string, string>;
  claimMetadataMapping?: Record<string, string>;
  boundSubject?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type DeleteIdentityOidcAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export type IdentityAwsAuth = {
  identityId: string;
  type: "iam";
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityAwsAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityAwsAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  stsEndpoint?: string;
  allowedPrincipalArns?: string;
  allowedAccountIds?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
};

export type DeleteIdentityAwsAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export type IdentityAliCloudAuth = {
  identityId: string;
  type: "iam";
  allowedArns: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityAliCloudAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  allowedArns: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityAliCloudAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  allowedArns: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type DeleteIdentityAliCloudAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export type IdentityOciAuth = {
  identityId: string;
  type: "iam";
  tenancyOcid: string;
  allowedUsernames?: string | null;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityOciAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  tenancyOcid: string;
  allowedUsernames?: string | null;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityOciAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  tenancyOcid?: string;
  allowedUsernames?: string | null;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type DeleteIdentityOciAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export type IdentityAzureAuth = {
  identityId: string;
  tenantId: string;
  resource: string;
  allowedServicePrincipalIds: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityAzureAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  tenantId: string;
  resource: string;
  allowedServicePrincipalIds: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityAzureAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  tenantId?: string;
  resource?: string;
  allowedServicePrincipalIds?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type DeleteIdentityAzureAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export enum IdentityKubernetesAuthTokenReviewMode {
  Api = "api",
  Gateway = "gateway"
}

export type IdentityKubernetesAuth = {
  identityId: string;
  kubernetesHost: string;
  tokenReviewerJwt: string;
  tokenReviewMode: IdentityKubernetesAuthTokenReviewMode;
  allowedNamespaces: string;
  allowedNames: string;
  allowedAudience: string;
  caCert: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
  gatewayId?: string | null;
};

export type AddIdentityKubernetesAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  kubernetesHost: string | null;
  tokenReviewerJwt?: string;
  tokenReviewMode: IdentityKubernetesAuthTokenReviewMode;
  allowedNamespaces: string;
  allowedNames: string;
  allowedAudience: string;
  gatewayId?: string | null;
  caCert: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityKubernetesAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  kubernetesHost?: string | null;
  tokenReviewerJwt?: string | null;
  tokenReviewMode?: IdentityKubernetesAuthTokenReviewMode;
  allowedNamespaces?: string;
  allowedNames?: string;
  allowedAudience?: string;
  gatewayId?: string | null;
  caCert?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type DeleteIdentityKubernetesAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export type IdentityTlsCertAuth = {
  identityId: string;
  caCertificate: string;
  allowedCommonNames: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityTlsCertAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  caCertificate: string;
  allowedCommonNames?: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityTlsCertAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  caCertificate: string;
  allowedCommonNames?: string | null;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type DeleteIdentityTlsCertAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export type CreateIdentityUniversalAuthClientSecretDTO = {
  identityId: string;
  description?: string;
  ttl?: number;
  numUsesLimit?: number;
};

export type ClientSecretData = {
  id: string;
  identityUniversalAuth: string;
  isClientSecretRevoked: boolean;
  description: string;
  clientSecretPrefix: string;
  clientSecretNumUses: number;
  clientSecretNumUsesLimit: number;
  clientSecretTTL: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateIdentityUniversalAuthClientSecretRes = {
  clientSecret: string;
  clientSecretData: ClientSecretData;
};

export type DeleteIdentityUniversalAuthClientSecretDTO = {
  identityId: string;
  clientSecretId: string;
};

export type ClearIdentityUniversalAuthLockoutsDTO = {
  identityId: string;
};

export type IdentityTokenAuth = {
  identityId: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityLdapAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  templateId?: string;
  url?: string;
  bindDN?: string;
  bindPass?: string;
  searchBase?: string;
  searchFilter: string;
  ldapCaCertificate?: string;
  allowedFields?: {
    key: string;
    value: string;
  }[];
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];

  lockoutEnabled: boolean;
  lockoutThreshold: number;
  lockoutDurationSeconds: number;
  lockoutCounterResetSeconds: number;
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityLdapAuthDTO = {
  identityId: string;
  organizationId?: string;
  projectId?: string;
  templateId?: string;
  url?: string;
  bindDN?: string;
  bindPass?: string;
  searchBase?: string;
  searchFilter?: string;
  ldapCaCertificate?: string;
  allowedFields?: {
    key: string;
    value: string;
  }[];
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];

  lockoutEnabled?: boolean;
  lockoutThreshold?: number;
  lockoutDurationSeconds?: number;
  lockoutCounterResetSeconds?: number;
} & ({ organizationId: string } | { projectId: string });

export type DeleteIdentityLdapAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export type IdentityLdapAuth = {
  url?: string;
  bindDN?: string;
  templateId?: string;
  bindPass?: string;
  searchBase?: string;
  searchFilter: string;
  ldapCaCertificate?: string;
  allowedFields?: {
    key: string;
    value: string;
  }[];

  identityId: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];

  lockoutEnabled: boolean;
  lockoutThreshold: number;
  lockoutDurationSeconds: number;
  lockoutCounterResetSeconds: number;
};

export type ClearIdentityLdapAuthLockoutsDTO = {
  identityId: string;
};

export type AddIdentityTokenAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityTokenAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type DeleteIdentityTokenAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export type IdentityJwtAuth = {
  identityId: string;
  configurationType: IdentityJwtConfigurationType;
  jwksUrl: string;
  jwksCaCert: string;
  publicKeys: string[];
  boundIssuer: string;
  boundAudiences: string;
  boundClaims: Record<string, string>;
  boundSubject: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityJwtAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  configurationType: string;
  jwksUrl?: string;
  jwksCaCert: string;
  publicKeys?: string[];
  boundIssuer: string;
  boundAudiences: string;
  boundClaims: Record<string, string>;
  boundSubject: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type UpdateIdentityJwtAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
  configurationType?: string;
  jwksUrl?: string;
  jwksCaCert?: string;
  publicKeys?: string[];
  boundIssuer?: string;
  boundAudiences?: string;
  boundClaims?: Record<string, string>;
  boundSubject?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
} & ({ organizationId: string } | { projectId: string });

export type DeleteIdentityJwtAuthDTO = {
  organizationId?: string;
  projectId?: string;
  identityId: string;
} & ({ organizationId: string } | { projectId: string });

export type CreateTokenIdentityTokenAuthDTO = {
  identityId: string;
  name: string;
};

export type CreateTokenIdentityTokenAuthRes = {
  accessToken: string;
  tokenData: IdentityAccessToken;
};

export type UpdateTokenIdentityTokenAuthDTO = {
  identityId: string;
  tokenId: string;
  name?: string;
};

export type RevokeTokenDTO = {
  identityId: string;
  tokenId: string;
};

export type RevokeTokenRes = {
  message: string;
};

export type TProjectIdentityMembershipsList = {
  identityMemberships: IdentityProjectMembershipV1[];
  totalCount: number;
};

export type TProjectIdentityMembershipsListV2 = {
  identityMemberships: IdentityProjectMembershipV2[];
  totalCount: number;
};

export type TSearchIdentitiesDTO = {
  limit?: number;
  offset?: number;
  orderBy?: OrgIdentityOrderBy;
  orderDirection?: OrderByDirection;
  search: {
    name?: { $contains: string };
    role?: { $in: string[] };
  };
};
