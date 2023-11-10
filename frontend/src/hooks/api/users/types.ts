import { UserWsKeyPair } from "../keys/types";

export enum AuthMethod {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml"
}

export type User = {
  createdAt: Date;
  updatedAt: Date;
  email: string;
  superAdmin: boolean;
  firstName?: string;
  lastName?: string;
  authProvider?: AuthMethod;
  authMethods: AuthMethod[];
  encryptionVersion?: number;
  protectedKey?: string;
  protectedKeyIV?: string;
  protectedKeyTag?: string;
  publicKey: string;
  encryptedPrivateKey?: string;
  iv?: string;
  tag?: string;
  isMfaEnabled: boolean;
  seenIps: string[];
  _id: string;
  __v: number;
};

export type OrgUser = {
  _id: string;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    _id: string;
    publicKey: string;
  };
  inviteEmail: string;
  organization: string;
  role: "owner" | "admin" | "member" | "custom";
  status: "invited" | "accepted" | "verified" | "completed";
  deniedPermissions: any[];
  customRole: string;
};

export type TWorkspaceUser = OrgUser;

export type AddUserToWsDTO = {
  workspaceId: string;
  decryptKey: UserWsKeyPair;
  userPrivateKey: string;
  members: {
    orgMembershipId: string;
    userPublicKey: string;
  }[];
};

export type UpdateOrgUserRoleDTO = {
  organizationId: string;
  membershipId: string;
  role: string;
};

export type DeletOrgMembershipDTO = {
  membershipId: string;
  orgId: string;
};

export type AddUserToOrgDTO = {
  inviteeEmail: string;
  organizationId: string;
};

export type CreateAPIKeyRes = {
  apiKey: string;
  apiKeyData: APIKeyData;
};

export type RenameUserDTO = {
  newName: string;
};

export type APIKeyData = {
  _id: string;
  name: string;
  user: string;
  lastUsed: string;
  createdAt: string;
  expiresAt: string;
};

export type TokenVersion = {
  _id: string;
  user: string;
  userAgent: string;
  ip: string;
  lastUsed: string;
  createdAt: string;
  updatedAt: string;
};
