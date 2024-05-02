import { UserWsKeyPair } from "../keys/types";

export enum AuthMethod {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml",
  KEYCLOAK_SAML = "keycloak-saml",
  LDAP = "ldap"
}

export type User = {
  createdAt: Date;
  updatedAt: Date;
  username: string;
  email?: string;
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
    username: string;
    email?: string;
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
  roles: string[];
};

export type TWorkspaceUser = {
  id: string;
  user: {
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    id: string;
    publicKey: string;
  };
  isGroupMember?: boolean;
  inviteEmail: string;
  organization: string;
  roles: (
    | {
        id: string;
        role: "owner" | "admin" | "member" | "no-access" | "custom";
        customRoleId: string;
        customRoleName: string;
        customRoleSlug: string;
        isTemporary: false;
        temporaryRange: null;
        temporaryMode: null;
        temporaryAccessEndTime: null;
        temporaryAccessStartTime: null;
      }
    | {
        id: string;
        role: "owner" | "admin" | "member" | "no-access" | "custom";
        customRoleId: string;
        customRoleName: string;
        customRoleSlug: string;
        isTemporary: true;
        temporaryRange: string;
        temporaryMode: string;
        temporaryAccessEndTime: string;
        temporaryAccessStartTime: string;
      }
  )[];
  status: "invited" | "accepted" | "verified" | "completed";
  deniedPermissions: any[];
};

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
  usernames: string[];
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
