import { TOrgRole } from "../roles/types";
import { Workspace } from "../workspace/types";
import { IdentityAuthMethod } from "./enums";

export type IdentityTrustedIp = {
  id: string;
  ipAddress: string;
  type: "ipv4" | "ipv6";
  prefix?: number;
};

export type Identity = {
  id: string;
  name: string;
  authMethod?: IdentityAuthMethod;
  createdAt: string;
  updatedAt: string;
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
  role: "admin" | "member" | "viewer" | "no-access" | "custom";
  customRole?: TOrgRole;
  createdAt: string;
  updatedAt: string;
};

export type IdentityMembership = {
  id: string;
  identity: Identity;
  project: Pick<Workspace, "id" | "name">;
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
          temporaryMode: string;
          temporaryAccessEndTime: string;
          temporaryAccessStartTime: string;
        }
    )
  >;
  createdAt: string;
  updatedAt: string;
};

export type CreateIdentityDTO = {
  name: string;
  organizationId: string;
  role?: string;
};

export type UpdateIdentityDTO = {
  identityId: string;
  name?: string;
  role?: string;
  organizationId: string;
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
};

export type AddIdentityUniversalAuthDTO = {
  organizationId: string;
  identityId: string;
  clientSecretTrustedIps: {
    ipAddress: string;
  }[];
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
};

export type UpdateIdentityUniversalAuthDTO = {
  organizationId: string;
  identityId: string;
  clientSecretTrustedIps?: {
    ipAddress: string;
  }[];
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
};

export type DeleteIdentityUniversalAuthDTO = {
  organizationId: string;
  identityId: string;
};

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
  organizationId: string;
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
};

export type UpdateIdentityGcpAuthDTO = {
  organizationId: string;
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
};

export type DeleteIdentityGcpAuthDTO = {
  organizationId: string;
  identityId: string;
};

export type IdentityOidcAuth = {
  identityId: string;
  oidcDiscoveryUrl: string;
  caCert: string;
  boundIssuer: string;
  boundAudiences: string;
  boundClaims: Record<string, string>;
  boundSubject: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityOidcAuthDTO = {
  organizationId: string;
  identityId: string;
  oidcDiscoveryUrl: string;
  caCert: string;
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
};

export type UpdateIdentityOidcAuthDTO = {
  organizationId: string;
  identityId: string;
  oidcDiscoveryUrl?: string;
  caCert?: string;
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
};

export type DeleteIdentityOidcAuthDTO = {
  organizationId: string;
  identityId: string;
};

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
  organizationId: string;
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
};

export type UpdateIdentityAwsAuthDTO = {
  organizationId: string;
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
  organizationId: string;
  identityId: string;
};

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
  organizationId: string;
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
};

export type UpdateIdentityAzureAuthDTO = {
  organizationId: string;
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
};

export type DeleteIdentityAzureAuthDTO = {
  organizationId: string;
  identityId: string;
};

export type IdentityKubernetesAuth = {
  identityId: string;
  kubernetesHost: string;
  tokenReviewerJwt: string;
  allowedNamespaces: string;
  allowedNames: string;
  allowedAudience: string;
  caCert: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityKubernetesAuthDTO = {
  organizationId: string;
  identityId: string;
  kubernetesHost: string;
  tokenReviewerJwt: string;
  allowedNamespaces: string;
  allowedNames: string;
  allowedAudience: string;
  caCert: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
};

export type UpdateIdentityKubernetesAuthDTO = {
  organizationId: string;
  identityId: string;
  kubernetesHost?: string;
  tokenReviewerJwt?: string;
  allowedNamespaces?: string;
  allowedNames?: string;
  allowedAudience?: string;
  caCert?: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
};

export type DeleteIdentityKubernetesAuthDTO = {
  organizationId: string;
  identityId: string;
};

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

export type IdentityTokenAuth = {
  identityId: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityTokenAuthDTO = {
  organizationId: string;
  identityId: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: {
    ipAddress: string;
  }[];
};

export type UpdateIdentityTokenAuthDTO = {
  organizationId: string;
  identityId: string;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: {
    ipAddress: string;
  }[];
};

export type DeleteIdentityTokenAuthDTO = {
  organizationId: string;
  identityId: string;
};

export type CreateTokenIdentityTokenAuthDTO = {
  identityId: string;
  name: string;
};

export type CreateTokenIdentityTokenAuthRes = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  accessTokenMaxTTL: number;
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

export type TProjectIdentitiesList = {
  identityMemberships: IdentityMembership[];
  totalCount: number;
};
