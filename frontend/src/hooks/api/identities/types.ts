import { TOrgRole, TProjectRole } from "../roles/types";
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
  organization: string;
  role: "admin" | "member" | "viewer" | "no-access" | "custom";
  customRole?: TProjectRole;
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
