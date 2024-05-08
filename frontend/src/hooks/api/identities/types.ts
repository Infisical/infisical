import { TOrgRole } from "../roles/types";
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

export type IdentityAwsIamAuth = {
  identityId: string;
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
};

export type AddIdentityAwsIamAuthDTO = {
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

export type UpdateIdentityAwsIamAuthDTO = {
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
