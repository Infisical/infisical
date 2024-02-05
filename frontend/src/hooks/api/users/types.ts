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
  isMfaEnabled: boolean;
  seenIps: string[];
  id: string;
};

export type UserEnc = {
  encryptionVersion?: number;
  protectedKey?: string;
  protectedKeyIV?: string;
  protectedKeyTag?: string;
  publicKey: string;
  encryptedPrivateKey?: string;
  iv?: string;
  tag?: string;
};

export type OrgUser = {
  id: string;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    id: string;
    publicKey: string;
  };
  inviteEmail: string;
  organization: string;
  role: "owner" | "admin" | "member" | "no-access" | "custom";
  status: "invited" | "accepted" | "verified" | "completed";
  deniedPermissions: any[];
  roleId: string;
};

export type TProjectMembership = {
  id: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  roleId: string;
};

export type TWorkspaceUser = OrgUser;

export type AddUserToWsDTOE2EE = {
  workspaceId: string;
  decryptKey: UserWsKeyPair;
  userPrivateKey: string;
  members: {
    orgMembershipId: string;
    userPublicKey: string;
  }[];
};

export type AddUserToWsDTONonE2EE = {
  projectId: string;
  emails: string[];
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
  id: string;
  name: string;
  user: string;
  lastUsed: string;
  createdAt: string;
  expiresAt: string;
};

export type TokenVersion = {
  id: string;
  user: string;
  userAgent: string;
  ip: string;
  lastUsed: string;
  createdAt: string;
  updatedAt: string;
};
