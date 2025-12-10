import { MfaMethod } from "../auth/types";
import { ProjectType, ProjectUserMembershipTemporaryMode } from "../projects/types";

export enum AuthMethod {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml",
  KEYCLOAK_SAML = "keycloak-saml",
  LDAP = "ldap",
  OIDC = "oidc",
  SAML = "saml"
}

export type User = {
  createdAt: Date;
  updatedAt: Date;
  username: string;
  email?: string | null;
  superAdmin: boolean;
  firstName?: string | null;
  lastName?: string | null;
  authProvider?: AuthMethod;
  authMethods: AuthMethod[];
  isMfaEnabled: boolean;
  selectedMfaMethod?: MfaMethod;
  seenIps: string[];
  id: string;
};

export enum UserAliasType {
  LDAP = "ldap",
  SAML = "saml",
  OIDC = "oidc"
}

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
  metadata: { key: string; value: string; id: string }[];
  user: {
    username: string;
    email?: string;
    isEmailVerified: boolean;
    firstName: string;
    lastName: string;
    id: string;
    publicKey: string;
    superAdmin: boolean;
  };
  inviteEmail: string;
  organization: string;
  role: "owner" | "admin" | "member" | "no-access" | "custom";
  customRoleSlug?: string;
  status: "invited" | "accepted" | "verified" | "completed";
  deniedPermissions: any[];
  roleId: string;
  isActive: boolean;
  lastLoginAuthMethod?: AuthMethod;
  lastLoginTime?: string;
};

export type TUserMembership = {
  id: string;
  scope: string;
  scopeOrgId: string;
  actorUserId: string;
  actorGroupId: string;
};

export type TProjectMembership = {
  id: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  roles: string[];
};

export type TWorkspaceUser = {
  id: string;
  user: {
    isOrgMembershipActive: boolean;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    id: string;
    publicKey: string;
  };
  createdAt: string;
  projectId: string;
  isGroupMember: boolean;
  project: {
    id: string;
    name: string;
    type: ProjectType;
  };
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
        temporaryMode: ProjectUserMembershipTemporaryMode;
        temporaryAccessEndTime: string;
        temporaryAccessStartTime: string;
      }
  )[];
  status: "invited" | "accepted" | "verified" | "completed";
  deniedPermissions: any[];
};

export type AddUserToWsDTONonE2EE = {
  projectId: string;
  usernames: string[];
  roleSlugs?: string[];
  orgId: string;
};

export type UpdateOrgMembershipDTO = {
  organizationId: string;
  membershipId: string;
  role?: string;
  isActive?: boolean;
  metadata?: { key: string; value: string }[];
};

export type DeleteOrgMembershipDTO = {
  membershipId: string;
  orgId: string;
};

export type DeleteOrgMembershipBatchDTO = {
  membershipIds: string[];
  orgId: string;
};

export type AddUserToOrgDTO = {
  inviteeEmails: string[];
  organizationRoleSlug: string;
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
