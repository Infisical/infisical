import { TOrgPermission } from "@app/lib/types";

import { ActorAuthMethod, ActorType, MfaMethod } from "../auth/auth-type";

export type TUpdateOrgMembershipDTO = {
  userId: string;
  orgId: string;
  membershipId: string;
  role?: string;
  isActive?: boolean;
  actorOrgId: string;
  metadata?: { key: string; value: string }[];
  actorAuthMethod: ActorAuthMethod;
};

export type TGetOrgMembershipDTO = {
  membershipId: string;
} & TOrgPermission;

export type TDeleteOrgMembershipDTO = {
  userId: string;
  orgId: string;
  membershipId: string;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
};

export type TDeleteOrgMembershipsDTO = {
  userId: string;
  orgId: string;
  membershipIds: string[];
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
};

export type TInviteUserToOrgDTO = {
  inviteeEmails: string[];
  organizationRoleSlug: string;
  projects?: {
    id: string;
    projectRoleSlug?: string[];
  }[];
} & TOrgPermission;

export type TResendOrgMemberInvitationDTO = {
  membershipId: string;
} & TOrgPermission;

export type TVerifyUserToOrgDTO = {
  email: string;
  orgId: string;
  code: string;
};

export type TFindOrgMembersByEmailDTO = {
  actor: ActorType;
  actorOrgId: string;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  orgId: string;
  emails: string[];
};

export type TFindAllWorkspacesDTO = {
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
  orgId: string;
};

export type TSecretShareBrandConfig = {
  faviconUrl?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
} | null;

export type TUpdateOrgDTO = {
  data: Partial<{
    name: string;
    slug: string;
    authEnforced: boolean;
    googleSsoAuthEnforced: boolean;
    scimEnabled: boolean;
    defaultMembershipRoleSlug: string;
    enforceMfa: boolean;
    selectedMfaMethod: MfaMethod;
    allowSecretSharingOutsideOrganization: boolean;
    bypassOrgAuthEnabled: boolean;
    userTokenExpiration: string;
    secretsProductEnabled: boolean;
    pkiProductEnabled: boolean;
    kmsProductEnabled: boolean;
    sshProductEnabled: boolean;
    scannerProductEnabled: boolean;
    shareSecretsProductEnabled: boolean;
    maxSharedSecretLifetime: number;
    maxSharedSecretViewLimit: number | null;
    blockDuplicateSecretSyncDestinations: boolean;
    secretShareBrandConfig: TSecretShareBrandConfig;
  }>;
} & TOrgPermission;

export type TUpgradePrivilegeSystemDTO = Omit<TOrgPermission, "actor">;

export type TGetOrgGroupsDTO = TOrgPermission;

export type TListProjectMembershipsByOrgMembershipIdDTO = {
  orgMembershipId: string;
} & TOrgPermission;

export enum OrgAuthMethod {
  OIDC = "oidc",
  SAML = "saml"
}
